from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..errors import APIError
from ..models import AgentRun, Chat, FileObject, Message, Resource, ResourceLink, User, Workspace, WorkspaceContextFile, utc_now
from ..schemas import ChatCreate, ChatUpdate, MessageAttachment, MessageResponse, WorkspaceCreate, WorkspaceUpdate
from .resource_uploads import attach_library_resources


def _keep_updated_at(record: Chat | Workspace) -> None:
    # Pinning alone must not reorder recency-sorted lists; flagging the column stops onupdate from firing.
    flag_modified(record, "updated_at")


def list_workspaces(session: Session, user: User) -> list[Workspace]:
    return list(
        session.scalars(
            select(Workspace)
            .where(Workspace.created_by == user.id, Workspace.deleted_at.is_(None))
            .order_by(Workspace.updated_at.desc(), Workspace.id.desc())
        )
    )


def create_workspace(session: Session, user: User, data: WorkspaceCreate) -> Workspace:
    name = data.name.strip()
    if not name:
        raise APIError(422, "empty_workspace_name", "Workspace name cannot be blank.")
    workspace = Workspace(name=name, description=data.description, created_by=user.id)
    session.add(workspace)
    session.flush()
    if data.ai_context and data.ai_context.strip():
        session.add(WorkspaceContextFile(
            workspace_id=workspace.id,
            name="ai-instructions.md",
            content=data.ai_context.strip(),
            created_by=user.id,
        ))
    session.commit()
    session.refresh(workspace)
    return workspace


def update_workspace(session: Session, user: User, workspace_id: str, data: WorkspaceUpdate) -> Workspace:
    workspace = require_workspace(session, user, workspace_id)
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise APIError(422, "empty_workspace_name", "Workspace name cannot be blank.")
        workspace.name = name
    if "description" in data.model_fields_set:
        workspace.description = data.description
    if data.archived is not None:
        workspace.archived_at = utc_now() if data.archived else None
    if data.pinned is not None:
        workspace.pinned_at = utc_now() if data.pinned else None
        if data.model_fields_set == {"pinned"}:
            _keep_updated_at(workspace)
    session.commit()
    session.refresh(workspace)
    return workspace


def delete_workspace(session: Session, user: User, workspace_id: str) -> None:
    workspace = require_workspace(session, user, workspace_id)
    workspace.deleted_at = utc_now()
    session.commit()


def require_workspace(session: Session, user: User, workspace_id: str) -> Workspace:
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.deleted_at is not None:
        raise APIError(404, "workspace_not_found", "Workspace not found.")
    if workspace.created_by != user.id:
        raise APIError(403, "workspace_forbidden", "You cannot access this workspace.")
    return workspace


def list_chats(session: Session, user: User) -> list[Chat]:
    return list(
        session.scalars(
            select(Chat)
            .where(Chat.created_by == user.id, Chat.deleted_at.is_(None))
            .order_by(Chat.updated_at.desc(), Chat.id.desc())
        )
    )


def _fallback_title(content: str) -> str:
    return " ".join(content.split())[:50]


def create_chat(session: Session, user: User, data: ChatCreate) -> tuple[Chat, Message]:
    existing = session.scalar(
        select(Chat).where(
            Chat.created_by == user.id,
            Chat.client_request_id == data.client_request_id,
        )
    )
    if existing is not None:
        message = session.scalar(
            select(Message).where(Message.chat_id == existing.id, Message.position == 1)
        )
        if message is None:
            raise APIError(409, "incomplete_chat", "The idempotent chat record is incomplete.")
        return existing, message

    if data.workspace_id is not None:
        require_workspace(session, user, data.workspace_id)
    content = data.content.strip()
    if not content:
        raise APIError(422, "empty_message", "Message content cannot be blank.")
    chat = Chat(
        title=_fallback_title(content),
        workspace_id=data.workspace_id,
        created_by=user.id,
        client_request_id=data.client_request_id,
    )
    session.add(chat)
    session.flush()
    message = Message(
        chat_id=chat.id,
        role="user",
        content=content,
        status="completed",
        position=1,
        client_request_id=data.client_request_id,
    )
    session.add(message)
    session.commit()
    session.refresh(chat)
    session.refresh(message)
    return chat, message


def update_chat(session: Session, user: User, chat_id: str, data: ChatUpdate) -> Chat:
    chat = require_chat(session, user, chat_id)
    if data.title is not None:
        title = data.title.strip()
        if not title:
            raise APIError(422, "empty_chat_title", "Chat title cannot be blank.")
        chat.title = title
        chat.title_source = "manual"
    if "workspace_id" in data.model_fields_set:
        if data.workspace_id is not None:
            require_workspace(session, user, data.workspace_id)
        chat.workspace_id = data.workspace_id
    if data.archived is not None:
        chat.archived_at = utc_now() if data.archived else None
    if data.is_unread is not None:
        chat.is_unread = data.is_unread
    if data.pinned is not None:
        chat.pinned_at = utc_now() if data.pinned else None
    if data.model_fields_set == {"pinned"}:
        _keep_updated_at(chat)
    else:
        chat.updated_at = utc_now()
    session.commit()
    session.refresh(chat)
    return chat


def delete_chat(session: Session, user: User, chat_id: str) -> None:
    chat = require_chat(session, user, chat_id)
    chat.deleted_at = utc_now()
    session.commit()


def require_chat(session: Session, user: User, chat_id: str) -> Chat:
    chat = session.get(Chat, chat_id)
    if chat is None or chat.deleted_at is not None:
        raise APIError(404, "chat_not_found", "Chat not found.")
    if chat.created_by != user.id:
        raise APIError(403, "chat_forbidden", "You cannot access this chat.")
    return chat


def message_response(session: Session, message: Message) -> MessageResponse:
    """Resolve attachment details for the response from their stable resource references."""
    references = session.execute(
        select(Resource.resource_type, ResourceLink.resource_id, Resource.name, FileObject.size_bytes)
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .outerjoin(AgentRun, AgentRun.id == Resource.run_id)
        .where(or_(ResourceLink.message_id == message.id, AgentRun.assistant_message_id == message.id))
        .order_by(ResourceLink.created_at, ResourceLink.id)
    ).unique().all()
    return MessageResponse.model_validate(message).model_copy(
        update={
            "attachment_refs": [
                MessageAttachment(resource_type=resource_type, resource_id=resource_id, name=name, size_bytes=size)
                for resource_type, resource_id, name, size in references
            ]
        }
    )


def list_messages(session: Session, user: User, chat_id: str) -> list[Message]:
    require_chat(session, user, chat_id)
    removed_from_queue = (
        select(AgentRun.id)
        .where(
            AgentRun.chat_id == chat_id,
            AgentRun.status == "cancelled",
            AgentRun.started_at.is_(None),
            or_(AgentRun.user_message_id == Message.id, AgentRun.assistant_message_id == Message.id),
        )
        .exists()
    )
    return list(
        session.scalars(
            select(Message).where(Message.chat_id == chat_id, ~removed_from_queue).order_by(Message.position, Message.id)
        )
    )


def create_message(
    session: Session, user: User, chat_id: str, content: str, request_id: str,
    resource_ids: list[str] | None = None,
) -> Message:
    chat = require_chat(session, user, chat_id)
    existing = session.scalar(
        select(Message).where(Message.chat_id == chat_id, Message.client_request_id == request_id)
    )
    if existing is not None:
        return existing
    normalized_content = content.strip()
    if not normalized_content:
        raise APIError(422, "empty_message", "Message content cannot be blank.")
    position = (session.scalar(select(func.max(Message.position)).where(Message.chat_id == chat_id)) or 0) + 1
    message = Message(
        chat_id=chat_id,
        role="user",
        content=normalized_content,
        status="completed",
        position=position,
        client_request_id=request_id,
    )
    session.add(message)
    if resource_ids:
        session.flush()
        attach_library_resources(session, user.id, message.id, resource_ids)
    chat.updated_at = utc_now()
    session.commit()
    session.refresh(message)
    return message
