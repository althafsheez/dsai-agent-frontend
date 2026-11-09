from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list[Message]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", order_by="Message.position"
    )


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

    chat: Mapped[Chat] = relationship(back_populates="messages")


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
