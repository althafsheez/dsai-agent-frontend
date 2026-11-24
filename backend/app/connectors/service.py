from __future__ import annotations

import json
from collections.abc import Callable
from typing import TypeVar

import anyio
from cryptography.fernet import Fernet, InvalidToken
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..errors import APIError
from ..models import DataConnection, User, Workspace, new_id, utc_now
from .base import DatabaseConnector
from .postgres import PostgresConnector
from .schemas import ConnectionResponse, ConnectionUpdate, PostgresSettings
from .security import LOCAL_CONNECTOR_OWNER

T = TypeVar("T")
CREDENTIAL_FIELDS = {"host", "port", "database", "username", "password", "ssl_mode"}
CONNECTION_FIELDS = {"name", "description", "workspace_id", "include_schema_for_ai", "enable_previews", "schema_filter"}


def require_workspace_owner(session: Session, user: User, workspace_id: str) -> None:
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.deleted_at is not None or workspace.created_by != user.id:
        raise APIError(404, "connector_workspace_not_found", "The connection workspace is unavailable.")


def owned_connections(session: Session, user: User):
    return select(DataConnection).where(
        DataConnection.created_by == user.id,
        or_(
            DataConnection.workspace_id.is_(None),
            DataConnection.workspace_id.in_(select(Workspace.id).where(
                Workspace.created_by == user.id, Workspace.deleted_at.is_(None),
            )),
        ),
    )


def require_connection(session: Session, user: User, connection_id: str) -> DataConnection:
    connection = session.scalar(owned_connections(session, user).where(DataConnection.id == connection_id))
    if connection is None or user.id != LOCAL_CONNECTOR_OWNER:
        raise APIError(404, "data_connection_not_found", "PostgreSQL connection is unavailable.")
    return connection


def validate_selection(session: Session, user: User, workspace_id: str | None, ids: list[str]) -> list[str]:
    for connection_id in ids:
        connection = require_connection(session, user, connection_id)
        if connection.workspace_id is not None and connection.workspace_id != workspace_id:
            raise APIError(403, "connection_outside_workspace", "Select this connection from its workspace.")
        if not connection.include_schema_for_ai:
            raise APIError(403, "connection_ai_disabled", "Enable schema access for AI before attaching this connection.")
    return list(dict.fromkeys(ids))


class ConnectionService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._limiter = anyio.CapacityLimiter(6)

    def _cipher(self) -> Fernet:
        key = self.settings.connector_encryption_key
        try:
            if key:
                return Fernet(key.get_secret_value())
        except ValueError:
            pass
        raise APIError(503, "connector_key_unavailable", "PostgreSQL credential encryption is not configured.")

    def credentials(self, connection: DataConnection) -> PostgresSettings:
        try:
            payload = json.loads(self._cipher().decrypt(connection.encrypted_credentials.encode()))
            if payload.pop("connection_id") != connection.id or payload.pop("owner_id") != connection.created_by:
                raise ValueError
            return PostgresSettings(**payload, **{
                name: getattr(connection, name) for name in CONNECTION_FIELDS
            })
        except (InvalidToken, ValueError, KeyError, TypeError):
            raise APIError(503, "connector_credentials_unavailable", "The saved credentials could not be decrypted.") from None

    def response(self, connection: DataConnection, user: User) -> ConnectionResponse:
        data = self.credentials(connection)
        return ConnectionResponse(
            id=connection.id, provider=connection.provider, owner=user.name, created_by=connection.created_by,
            status=connection.status, created_at=connection.created_at, updated_at=connection.updated_at,
            last_tested_at=connection.last_tested_at, **data.model_dump(exclude={"password"}),
        )

    def merge(self, connection: DataConnection, patch: ConnectionUpdate) -> PostgresSettings:
        update = patch.model_dump(exclude_unset=True)
        if update.get("password") is None:
            update.pop("password", None)
        if update.get("description", "") is None:
            update["description"] = ""
        try:
            return PostgresSettings.model_validate({**self.credentials(connection).model_dump(), **update})
        except ValidationError:
            raise APIError(422, "invalid_connector_configuration", "Check the PostgreSQL connection fields.") from None

    def save(self, session: Session, user: User, data: PostgresSettings, connection: DataConnection | None = None) -> DataConnection:
        if data.workspace_id:
            require_workspace_owner(session, user, data.workspace_id)
        if connection is None:
            connection = DataConnection(id=new_id(), created_by=user.id)
            session.add(connection)
        payload = data.model_dump(include=CREDENTIAL_FIELDS - {"password"})
        payload.update(password=data.password.get_secret_value(), connection_id=connection.id, owner_id=user.id)
        connection.encrypted_credentials = self._cipher().encrypt(json.dumps(payload).encode()).decode()
        for key in CONNECTION_FIELDS:
            setattr(connection, key, getattr(data, key))
        connection.status = "connected"
        connection.last_tested_at = utc_now()
        session.commit()
        return connection

    async def perform(self, data: PostgresSettings, operation: Callable[[DatabaseConnector], T]) -> T:
        def execute() -> T:
            connector: DatabaseConnector = PostgresConnector(data, self.settings)
            try:
                return operation(connector)
            finally:
                connector.close()

        return await anyio.to_thread.run_sync(execute, limiter=self._limiter)

    def check_configuration(self) -> None:
        self._cipher()
