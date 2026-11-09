from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserResponse(APIModel):
    id: str
    name: str
    initials: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)


class WorkspaceResponse(APIModel):
    id: str
    name: str
    description: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    deleted_at: datetime | None


class ChatCreate(BaseModel):
    workspace_id: str | None = None
    content: str = Field(min_length=1, max_length=100_000)
    client_request_id: str = Field(min_length=1, max_length=100)


class ChatResponse(APIModel):
    id: str
    title: str
    title_source: Literal["fallback", "generated", "manual"]
    workspace_id: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    deleted_at: datetime | None
    first_run_at: datetime | None


class MessageResponse(APIModel):
    id: str
    chat_id: str
    role: Literal["user", "assistant"]
    kind: Literal["normal", "steering"]
    content: str
    status: str
    created_at: datetime
    updated_at: datetime
    attachment_refs: list[dict[str, str]] = Field(default_factory=list)


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    client_request_id: str = Field(min_length=1, max_length=100)


class ChatCreateResponse(BaseModel):
    chat: ChatResponse
    message: MessageResponse


class ListResponse(BaseModel):
    items: list[Any]
    next_cursor: str | None = None


class ModelMetadata(BaseModel):
    id: str
    label: str
    supported_efforts: list[str]
    default_effort: str | None


class ModelsResponse(BaseModel):
    default_model_id: str | None
    models: list[ModelMetadata]
    configuration_status: str


class RunStart(BaseModel):
    user_message_id: str
    model_id: str
    effort: str | None = None
    client_request_id: str = Field(min_length=1, max_length=100)


class RetryStart(BaseModel):
    client_request_id: str = Field(min_length=1, max_length=100)
    model_id: str | None = None
    effort: str | None = None


class RunResponse(APIModel):
    id: str
    chat_id: str
    user_message_id: str
    assistant_message_id: str
    status: str
    model_id: str
    effort: str | None
    client_request_id: str
    previous_run_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error_code: str | None
    error_detail: str | None


class CancelRun(BaseModel):
    reason: Literal["user", "navigation", "refresh"]


class EventEnvelope(BaseModel):
    event_id: str
    run_id: str
    type: str
    data: dict[str, Any]
    timestamp: datetime
    sequence: int
