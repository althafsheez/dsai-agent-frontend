from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..connectors.schemas import (
    ConnectionCreate, ConnectionID, ConnectionList, ConnectionResponse, ConnectionTest,
    ConnectionUpdate, Identifier, PostgresSettings, QueryRequest, QueryResult, SchemaList, TableDetails, TableList,
)
from ..connectors.service import ConnectionService, owned_connections, require_connection, require_workspace_owner
from ..connectors.security import require_local_postgres
from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import DataConnection, User, utc_now
from ..services.records import require_chat

router = APIRouter(tags=["connectors"])

DB = Annotated[Session, Depends(get_db)]

async def local_owner(request: Request, user: Annotated[User, Depends(get_current_user)]) -> User:
    require_local_postgres(request.app.state.settings, user.id)
    return user


Actor = Annotated[User, Depends(local_owner)]


def service(request: Request) -> ConnectionService:
    return request.app.state.connections


Connections = Annotated[ConnectionService, Depends(service)]


@router.post("/api/connectors/postgresql/test", response_model=ConnectionTest)
async def test_postgres(data: PostgresSettings, user: Actor, db: DB, connections: Connections) -> ConnectionTest:
    connections.check_configuration()
    if data.workspace_id:
        require_workspace_owner(db, user, data.workspace_id)
    return ConnectionTest(schemas=await connections.perform(data, lambda adapter: adapter.test_connection()))


@router.post("/api/connectors", response_model=ConnectionResponse, status_code=201)
async def create(data: ConnectionCreate, user: Actor, db: DB, connections: Connections) -> ConnectionResponse:
    connections.check_configuration()
    if data.workspace_id:
        require_workspace_owner(db, user, data.workspace_id)
    await connections.perform(data, lambda adapter: adapter.test_connection())
    return connections.response(connections.save(db, user, data), user)


@router.get("/api/connectors", response_model=ConnectionList)
async def list_connections(
    user: Actor, db: DB, connections: Connections,
    chat_id: str | None = Query(default=None, max_length=36),
    workspace_id: str | None = Query(default=None, max_length=36),
    for_analysis: bool = False,
) -> ConnectionList:
    query = owned_connections(db, user)
    if chat_id:
        workspace_id = require_chat(db, user, chat_id).workspace_id
    elif workspace_id:
        require_workspace_owner(db, user, workspace_id)
    if for_analysis or chat_id or workspace_id:
        query = query.where(
            or_(DataConnection.workspace_id.is_(None), DataConnection.workspace_id == workspace_id),
            DataConnection.include_schema_for_ai.is_(True),
        )
    return ConnectionList(items=[
        connections.response(item, user)
        for item in db.scalars(query.order_by(DataConnection.name, DataConnection.id))
    ])


@router.get("/api/connectors/{connection_id}", response_model=ConnectionResponse)
async def detail(connection_id: ConnectionID, user: Actor, db: DB, connections: Connections) -> ConnectionResponse:
    return connections.response(require_connection(db, user, connection_id), user)


@router.post("/api/connectors/{connection_id}/test", response_model=ConnectionTest)
async def test_saved(connection_id: ConnectionID, data: ConnectionUpdate, user: Actor, db: DB, connections: Connections) -> ConnectionTest:
    record = require_connection(db, user, connection_id)
    config = connections.merge(record, data)
    if config.workspace_id:
        require_workspace_owner(db, user, config.workspace_id)
    return ConnectionTest(schemas=await connections.perform(config, lambda adapter: adapter.test_connection()))


@router.patch("/api/connectors/{connection_id}", response_model=ConnectionResponse)
async def update(connection_id: ConnectionID, data: ConnectionUpdate, user: Actor, db: DB, connections: Connections) -> ConnectionResponse:
    record = require_connection(db, user, connection_id)
    config = connections.merge(record, data)
    if config.workspace_id:
        require_workspace_owner(db, user, config.workspace_id)
    await connections.perform(config, lambda adapter: adapter.test_connection())
    return connections.response(connections.save(db, user, config, record), user)


@router.delete("/api/connectors/{connection_id}", status_code=204)
async def disconnect(connection_id: ConnectionID, user: Actor, db: DB) -> Response:
    db.delete(require_connection(db, user, connection_id))
    db.commit()
    return Response(status_code=204)


@router.get("/api/connectors/{connection_id}/schemas", response_model=SchemaList)
async def schemas(connection_id: ConnectionID, user: Actor, db: DB, connections: Connections) -> SchemaList:
    config = connections.credentials(require_connection(db, user, connection_id))
    return await connections.perform(config, lambda adapter: adapter.list_schemas())


@router.get("/api/connectors/{connection_id}/tables", response_model=TableList)
async def tables(
    connection_id: ConnectionID, user: Actor, db: DB, connections: Connections,
    schema: Identifier | None = None, search: str = Query(default="", max_length=63),
) -> TableList:
    config = connections.credentials(require_connection(db, user, connection_id))
    return await connections.perform(config, lambda adapter: adapter.list_tables(schema, search))


@router.get("/api/connectors/{connection_id}/tables/{schema}/{table}", response_model=TableDetails)
async def table_details(
    connection_id: ConnectionID, schema: Identifier, table: Identifier, user: Actor, db: DB, connections: Connections,
    preview: bool = False, limit: int = Query(default=20, ge=1, le=100),
) -> TableDetails:
    config = connections.credentials(require_connection(db, user, connection_id))
    if preview and not config.enable_previews:
        raise APIError(403, "postgres_preview_disabled", "Row previews are disabled for this connection.")

    def load(adapter):
        result = adapter.describe_table(schema, table)
        if preview:
            result.preview = adapter.preview_table(schema, table, limit)
        return result

    return await connections.perform(config, load)


@router.post("/api/connectors/{connection_id}/refresh-schema", response_model=SchemaList)
async def refresh_schema(connection_id: ConnectionID, user: Actor, db: DB, connections: Connections) -> SchemaList:
    record = require_connection(db, user, connection_id)
    config = connections.credentials(record)
    try:
        result = await connections.perform(config, lambda adapter: adapter.list_schemas())
    except APIError:
        record.status = "failed"
        record.last_tested_at = utc_now()
        db.commit()
        raise
    record.status = "connected"
    record.last_tested_at = utc_now()
    db.commit()
    return result


@router.post("/api/connectors/{connection_id}/query", response_model=QueryResult)
async def run_query(connection_id: ConnectionID, data: QueryRequest, user: Actor, db: DB, connections: Connections) -> QueryResult:
    config = connections.credentials(require_connection(db, user, connection_id))
    return await connections.perform(config, lambda adapter: adapter.execute_readonly_query(data.sql, data.limit))
