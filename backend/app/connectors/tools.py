from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session, sessionmaker

from agentic.runtime.contracts import ToolContext
from agentic.runtime.diagnostics import diagnostic
from agentic.tools.registry import ToolDefinition, ToolRegistry

from ..errors import APIError
from ..models import AgentRun, Chat, DataConnection, Message, User
from .security import require_local_postgres
from .schemas import ConnectionID, Identifier, QueryRequest
from .service import ConnectionService, require_connection


class TableListInput(BaseModel):
    connection_id: ConnectionID
    schema_name: Identifier | None = Field(default=None, alias="schema")


class TableInput(BaseModel):
    connection_id: ConnectionID
    schema_name: Identifier = Field(alias="schema")
    table: Identifier


class SqlInput(QueryRequest):
    connection_id: ConnectionID


def _scope(db: Session, context: ToolContext) -> tuple[User, Chat, Message]:
    run = db.get(AgentRun, context.run_id)
    chat = db.get(Chat, context.chat_id)
    user = db.get(User, context.user_id)
    message = db.get(Message, run.user_message_id) if run else None
    if (
        run is None or run.chat_id != context.chat_id or run.status != "running"
        or chat is None or chat.deleted_at is not None or chat.created_by != context.user_id
        or message is None or message.chat_id != chat.id or user is None
    ):
        raise APIError(404, "postgres_run_unavailable", "The analysis connection scope is unavailable.")
    return user, chat, message


def _authorized(db: Session, user: User, chat: Chat, connection_id: str) -> DataConnection:
    connection = require_connection(db, user, connection_id)
    if not connection.include_schema_for_ai or (
        connection.workspace_id is not None and connection.workspace_id != chat.workspace_id
    ):
        raise APIError(403, "postgres_tool_forbidden", "This connection is unavailable to the analysis.")
    return connection


def database_inventory(db: Session, context: ToolContext, service: ConnectionService) -> list[dict[str, Any]]:
    try:
        require_local_postgres(service.settings, context.user_id)
        user, chat, message = _scope(db, context)
    except APIError:
        return []
    result = []
    for connection_id in message.connection_ids:
        try:
            connection = _authorized(db, user, chat, connection_id)
        except APIError:
            continue
        result.append({
            "connection_id": connection.id, "name": connection.name,
            "provider": connection.provider, "schemas": connection.schema_filter,
        })
    return result


def register_postgres_tools(
    registry: ToolRegistry, session_factory: sessionmaker[Session], service: ConnectionService,
) -> None:
    def config(context: ToolContext, connection_id: str):
        require_local_postgres(service.settings, context.user_id)
        with session_factory() as db:
            user, chat, message = _scope(db, context)
            if connection_id not in message.connection_ids:
                raise APIError(403, "postgres_not_selected", "This PostgreSQL connection was not attached to the question.")
            return service.credentials(_authorized(db, user, chat, connection_id))

    async def list_tables(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        args = TableListInput.model_validate(arguments)
        result = await service.perform(config(context, args.connection_id), lambda adapter: adapter.list_tables(args.schema_name))
        return result.model_dump(mode="json")

    async def describe_table(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        args = TableInput.model_validate(arguments)
        result = await service.perform(config(context, args.connection_id), lambda adapter: adapter.describe_table(args.schema_name, args.table))
        return result.model_dump(mode="json", exclude={"preview"})

    async def query(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        args = SqlInput.model_validate(arguments)
        result = await service.perform(config(context, args.connection_id), lambda adapter: adapter.execute_readonly_query(args.sql, args.limit))
        return result.model_dump(mode="json")

    def register(name, description, properties, required, handler):
        async def execute(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
            try:
                return await handler(arguments, context)
            except ValidationError:
                message = "Supply valid PostgreSQL tool arguments."
                return {"error": message, "diagnostic": diagnostic(
                    "PostgreSQL", "postgres_invalid_arguments", "invalid_request", message, "tool_validation",
                    retry_attempts=0,
                )}
            except APIError as exc:
                category, message = {
                    "postgres_auth_failed": ("authentication", "Authentication failed"),
                    "postgres_tls_failed": ("tls", "TLS verification failed"),
                    "postgres_connect_timeout": ("timeout", "Connection timed out"),
                    "postgres_timeout": ("timeout", "Query timed out"),
                    "postgres_connection_failed": ("connection", "Could not connect to PostgreSQL"),
                    "postgres_unreachable": ("connection", "PostgreSQL host could not be reached"),
                    "postgres_query_failed": ("query", "Query execution failed"),
                }.get(exc.code, ({403: "permission", 404: "not_found", 422: "invalid_request"}.get(exc.status_code, "execution"), exc.message))
                details = exc.details or {}
                stage = {
                    "postgres_auth_failed": "connect", "postgres_tls_failed": "connect",
                    "postgres_connect_timeout": "connect", "postgres_connection_failed": "connect",
                    "postgres_unreachable": "connect", "postgres_timeout": "query",
                }.get(exc.code, name)
                # These are application error codes. PostgreSQL uses its own protocol, not HTTP.
                return {"error": exc.message, "code": exc.code, "diagnostic": diagnostic(
                    "PostgreSQL", exc.code, category, message, details.get("stage", stage),
                    retryable=category in {"timeout", "connection"}, retry_attempts=0,
                    development={label: details[key] for key, label in (("driver_error", "Driver error"), ("sqlstate", "SQLSTATE")) if details.get(key)} or None,
                )}

        registry.register(ToolDefinition(name, description, {
            "type": "object", "properties": properties, "required": required,
        }, execute))

    string = {"type": "string"}
    connection = {"connection_id": string}
    register("list_database_tables", "List permitted PostgreSQL tables for a connection attached to this question.",
             {**connection, "schema": string}, ["connection_id"], list_tables)
    register("describe_database_table", "Inspect columns, data types, nullability, and primary keys for an attached PostgreSQL table.",
             {**connection, "schema": string, "table": string}, ["connection_id", "schema", "table"], describe_table)
    register("query_database", "Run one read-only PostgreSQL SELECT on an attached connection. Use schema-qualified tables, built-in analytics functions, and aggregate before returning data. Results are bounded and may be truncated.",
             {**connection, "sql": string, "limit": {"type": "integer", "minimum": 1, "maximum": 200}},
             ["connection_id", "sql"], query)
