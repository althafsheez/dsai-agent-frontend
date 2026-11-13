from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_utc_datetimes(self, value: Any) -> Any:
        """SQLite drops timezone metadata; API timestamps must still be unambiguous UTC."""
        if not isinstance(value, datetime):
            return value
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class UserResponse(APIModel):
    id: str
    name: str
    initials: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    ai_context: str | None = Field(default=None, max_length=100_000)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    archived: bool | None = None


class WorkspaceResponse(APIModel):
    id: str
    name: str
    description: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    deleted_at: datetime | None


class WorkspaceContextFileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    content: str = Field(default="", max_length=100_000)


class WorkspaceContextFileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=240)
    content: str | None = Field(default=None, max_length=100_000)


class WorkspaceContextFileResponse(APIModel):
    id: str
    workspace_id: str
    name: str
    content: str
    created_by: str
    created_at: datetime
    updated_at: datetime


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)


class WorkflowResponse(APIModel):
    id: str
    workspace_id: str | None
    created_by: str
    name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class WorkflowChatCreate(BaseModel):
    chat_id: str
    relation_type: Literal["referenced", "created_by_run"] = "referenced"


class ChatCreate(BaseModel):
    workspace_id: str | None = None
    content: str = Field(min_length=1, max_length=100_000)
    client_request_id: str = Field(min_length=1, max_length=100)


class ChatUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    workspace_id: str | None = None
    archived: bool | None = None
    is_unread: bool | None = None


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
    is_unread: bool
    active_run_status: str | None = None


class ChatPresence(BaseModel):
    viewing: bool


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


class QueueStart(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    model_id: str
    effort: str | None = None
    client_request_id: str = Field(min_length=1, max_length=100)


class SteerStart(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    client_request_id: str = Field(min_length=1, max_length=100)


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


class QueueResponse(BaseModel):
    message: MessageResponse
    run: RunResponse
    position: int


class SteeringInstructionResponse(APIModel):
    id: str
    run_id: str
    message_id: str
    status: Literal["received", "applied", "unapplied"]
    checkpoint: str | None
    created_at: datetime


class SteerResponse(BaseModel):
    instruction: SteeringInstructionResponse


class CancelRun(BaseModel):
    reason: Literal["user", "navigation", "refresh"]


class EventEnvelope(BaseModel):
    event_id: str
    run_id: str
    type: str
    data: dict[str, Any]
    timestamp: datetime
    sequence: int
