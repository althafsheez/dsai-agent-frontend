from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import APIError
from ..models import Chat, Message, User, Workspace
from ..schemas import ChatCreate, WorkspaceCreate


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
    session.commit()
    session.refresh(workspace)
    return workspace


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


def require_chat(session: Session, user: User, chat_id: str) -> Chat:
    chat = session.get(Chat, chat_id)
    if chat is None or chat.deleted_at is not None:
        raise APIError(404, "chat_not_found", "Chat not found.")
    if chat.created_by != user.id:
        raise APIError(403, "chat_forbidden", "You cannot access this chat.")
    return chat


def list_messages(session: Session, user: User, chat_id: str) -> list[Message]:
    require_chat(session, user, chat_id)
    return list(
        session.scalars(
            select(Message).where(Message.chat_id == chat_id).order_by(Message.position, Message.id)
        )
    )


def create_message(session: Session, user: User, chat_id: str, content: str, request_id: str) -> Message:
    require_chat(session, user, chat_id)
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
    session.commit()
    session.refresh(message)
    return message
