from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    initials: Mapped[str] = mapped_column(String(8))


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    context_files: Mapped[list["WorkspaceContextFile"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", order_by="WorkspaceContextFile.name"
    )


class Chat(TimestampMixin, Base):
    __tablename__ = "chats"
    __table_args__ = (UniqueConstraint("created_by", "client_request_id", name="uq_chat_create_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200))
    title_source: Mapped[str] = mapped_column(String(16), default="fallback")
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    client_request_id: Mapped[str] = mapped_column(String(100))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_unread: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    messages: Mapped[list[Message]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", order_by="Message.position"
    )


class WorkspaceContextFile(TimestampMixin, Base):
    """Markdown instructions shared by future runs in one workspace."""

    __tablename__ = "workspace_context_files"
    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_workspace_context_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(240))
    content: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    workspace: Mapped[Workspace] = relationship(back_populates="context_files")


class WorkspaceInvite(TimestampMixin, Base):
    """A person invited to a workspace by email. No mail is sent; demo auth cannot sign them in yet."""

    __tablename__ = "workspace_invites"
    __table_args__ = (UniqueConstraint("workspace_id", "email", name="uq_workspace_invite_email"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(16))
    invited_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)


class Workflow(TimestampMixin, Base):
    """Small persisted workflow record; execution remains independent of chats."""

    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)


class WorkflowChat(Base):
    __tablename__ = "workflow_chats"
    __table_args__ = (UniqueConstraint("workflow_id", "chat_id", name="uq_workflow_chat"),)

    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), primary_key=True)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id"), primary_key=True)
    relation_type: Mapped[str] = mapped_column(String(24), default="referenced")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Message(TimestampMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("chat_id", "position", name="uq_message_chat_position"),
        UniqueConstraint("chat_id", "client_request_id", name="uq_message_request"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(16), default="normal")
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="completed")
    position: Mapped[int] = mapped_column(Integer)
    client_request_id: Mapped[str | None] = mapped_column(String(100))
    connection_ids: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")

    chat: Mapped[Chat] = relationship(back_populates="messages")


class DataConnection(TimestampMixin, Base):
    __tablename__ = "data_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(24), default="postgresql")
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id"), index=True)
    encrypted_credentials: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24))
    include_schema_for_ai: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_previews: Mapped[bool] = mapped_column(Boolean, default=True)
    schema_filter: Mapped[list[str]] = mapped_column(JSON)
    last_tested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class QuickMessage(TimestampMixin, Base):
    """A compact, independent read-only conversation for a chat or workspace."""

    __tablename__ = "quick_messages"
    __table_args__ = (
        UniqueConstraint("context_type", "context_id", "user_id", "position", name="uq_quick_message_position"),
        UniqueConstraint("context_type", "context_id", "user_id", "client_request_id", name="uq_quick_message_request"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    context_type: Mapped[str] = mapped_column(String(16), index=True)
    context_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="completed")
    position: Mapped[int] = mapped_column(Integer)
    client_request_id: Mapped[str | None] = mapped_column(String(100))
    # One context can hold several independent conversations (tabs); positions stay unique across all of them.
    thread_id: Mapped[str] = mapped_column(String(36), default="main", server_default="main", index=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (UniqueConstraint("chat_id", "client_request_id", name="uq_run_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id"), index=True)
    user_message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"))
    assistant_message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"))
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    model_id: Mapped[str] = mapped_column(String(160))
    effort: Mapped[str | None] = mapped_column(String(24))
    client_request_id: Mapped[str] = mapped_column(String(100))
    previous_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_detail: Mapped[str | None] = mapped_column(Text)


class ExecutionEvent(Base):
    __tablename__ = "execution_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_event_run_sequence"),)

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(64), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SteeringInstruction(Base):
    __tablename__ = "steering_instructions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="received", index=True)
    checkpoint: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class FileObject(Base):
    __tablename__ = "file_objects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    content_hash: Mapped[str] = mapped_column(String(64), unique=True)
    relative_storage_path: Mapped[str] = mapped_column(String(300), unique=True)
    mime_type: Mapped[str] = mapped_column(String(160))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    resource_type: Mapped[str] = mapped_column(String(16))
    file_object_id: Mapped[str] = mapped_column(ForeignKey("file_objects.id"))
    name: Mapped[str] = mapped_column(String(240))
    origin: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(16), default="input")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ResourceLink(Base):
    __tablename__ = "resource_links"
    __table_args__ = (
        UniqueConstraint("resource_id", "scope_type", "scope_id", name="uq_resource_scope"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    resource_id: Mapped[str] = mapped_column(ForeignKey("resources.id"), index=True)
    scope_type: Mapped[str] = mapped_column(String(16))
    scope_id: Mapped[str] = mapped_column(String(36), index=True)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("messages.id"))
    client_upload_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "artifact_id", name="uq_favorite_artifact"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("resources.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LibraryEntry(Base):
    """A user-owned reference to any resource, without duplicating file bytes."""

    __tablename__ = "library_entries"
    __table_args__ = (UniqueConstraint("user_id", "resource_id", name="uq_library_entry_resource"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    resource_id: Mapped[str] = mapped_column(ForeignKey("resources.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AgentMemory(TimestampMixin, Base):
    __tablename__ = "agent_memories"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_agent_memory_user_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    value: Mapped[str] = mapped_column(Text)


class ConnectorConnection(TimestampMixin, Base):
    """A user's OAuth link to an external data source. Tokens are stored encrypted and never returned by the API."""

    __tablename__ = "connector_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_connector_user_provider"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    account_email: Mapped[str | None] = mapped_column(String(320))
    scopes: Mapped[str] = mapped_column(Text, default="")
    access_token_enc: Mapped[str] = mapped_column(Text)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Dashboard(TimestampMixin, Base):
    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    slicers: Mapped[list[Any]] = mapped_column(JSON, default=list)
    dataset_ids: Mapped[list[Any]] = mapped_column(JSON, default=list)
    widgets: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # [{"user_id": str, "role": "viewer" | "editor"}]; a published dashboard is also visible to the whole team (view only).
    shares: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # 0 = manual refresh only; otherwise the minutes between automatic data refreshes while the dashboard is open.
    refresh_minutes: Mapped[int] = mapped_column(Integer, default=0)
    # Users who pinned it (pins are personal), and the small KPI + chart shown on the listing card, computed when it is saved.
    pinned_by: Mapped[list[Any]] = mapped_column(JSON, default=list)
    preview: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class WorkflowDefinition(TimestampMixin, Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(16), default="draft")
    trigger: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    steps: Mapped[list[Any]] = mapped_column(JSON, default=list)
    prompt: Mapped[str] = mapped_column(Text, default="")
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkflowRunRecord(TimestampMixin, Base):
    __tablename__ = "workflow_run_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    workflow_id: Mapped[str] = mapped_column(String(64), index=True)
    workflow_name: Mapped[str] = mapped_column(String(160))
    trigger: Mapped[str] = mapped_column(String(16), default="manual")
    plan: Mapped[list[Any]] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="running")
    results: Mapped[list[Any]] = mapped_column(JSON, default=list)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str] = mapped_column(Text, default="")
