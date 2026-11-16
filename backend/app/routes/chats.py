from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..models import AgentRun, Chat, Message, Resource, ResourceLink, User
from ..schemas import (
    ChatCreate,
    ChatCreateResponse,
    ChatResponse,
    ChatPresence,
    ChatUpdate,
    MessageCreate,
    MessageResponse,
)
from ..services.records import (
    create_chat,
    create_message,
    delete_chat,
    list_chats,
    list_messages,
    require_chat,
    update_chat,
)


router = APIRouter(prefix="/api/chats", tags=["chats"])


def _chat_response(session: Session, chat) -> ChatResponse:
    active_status = session.scalar(
        select(AgentRun.status)
        .where(AgentRun.chat_id == chat.id, AgentRun.status.in_(("queued", "running")))
        .order_by(AgentRun.created_at.desc())
    )
    return ChatResponse.model_validate(chat).model_copy(update={"active_run_status": active_status})


def _message_response(session: Session, message: Message) -> MessageResponse:
    """Attach stable resource references without copying resource metadata into messages."""
    references = session.execute(
        select(Resource.resource_type, ResourceLink.resource_id)
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .outerjoin(AgentRun, AgentRun.id == Resource.run_id)
        .where(or_(ResourceLink.message_id == message.id, AgentRun.assistant_message_id == message.id))
        .order_by(ResourceLink.created_at, ResourceLink.id)
    ).all()
    return MessageResponse.model_validate(message).model_copy(
        update={
            "attachment_refs": [
                {"resource_type": resource_type, "resource_id": resource_id}
                for resource_type, resource_id in references
            ]
        }
    )


@router.get("")
async def get_chats(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return {
        "items": [_chat_response(session, item) for item in list_chats(session, user)],
        "next_cursor": None,
    }


@router.post("", response_model=ChatCreateResponse, status_code=status.HTTP_201_CREATED)
async def post_chat(
    data: ChatCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatCreateResponse:
    chat, message = create_chat(session, user, data)
    return ChatCreateResponse(
        chat=_chat_response(session, chat),
        message=_message_response(session, message),
    )


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    return _chat_response(session, require_chat(session, user, chat_id))


@router.patch("/{chat_id}", response_model=ChatResponse)
async def patch_chat(
    chat_id: str,
    data: ChatUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    return _chat_response(session, update_chat(session, user, chat_id, data))


@router.get("/activity/list")
async def get_activity(
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    active_chat_ids = select(AgentRun.chat_id).where(AgentRun.status.in_(("queued", "running")))
    chats = session.scalars(
        select(Chat)
        .where(
            Chat.created_by == user.id,
            Chat.deleted_at.is_(None),
            or_(
                Chat.is_unread.is_(True),
                Chat.id.in_(active_chat_ids),
            ),
        )
        .order_by(
            case((Chat.id.in_(active_chat_ids), 0), else_=1),
            Chat.updated_at.desc(),
        )
    )
    return {"items": [_chat_response(session, chat) for chat in chats], "next_cursor": None}


@router.post("/{chat_id}/presence", status_code=status.HTTP_204_NO_CONTENT)
async def set_chat_presence(
    chat_id: str,
    data: ChatPresence,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    chat = require_chat(session, user, chat_id)
    request.app.state.run_coordinator.set_viewing(chat.id, user.id, data.viewing)
    if data.viewing and chat.is_unread:
        chat.is_unread = False
        session.commit()


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chat(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    delete_chat(session, user, chat_id)


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {
        "items": [_message_response(session, item) for item in list_messages(session, user, chat_id)],
        "next_cursor": None,
    }


@router.post("/{chat_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def post_message(
    chat_id: str,
    data: MessageCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    message = create_message(session, user, chat_id, data.content, data.client_request_id)
    return _message_response(session, message)
