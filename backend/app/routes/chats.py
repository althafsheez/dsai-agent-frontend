from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..models import User
from ..schemas import (
    ChatCreate,
    ChatCreateResponse,
    ChatResponse,
    MessageCreate,
    MessageResponse,
)
from ..services.records import (
    create_chat,
    create_message,
    list_chats,
    list_messages,
    require_chat,
)


router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("")
async def get_chats(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return {
        "items": [ChatResponse.model_validate(item) for item in list_chats(session, user)],
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
        chat=ChatResponse.model_validate(chat),
        message=MessageResponse.model_validate(message),
    )


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    return ChatResponse.model_validate(require_chat(session, user, chat_id))


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {
        "items": [MessageResponse.model_validate(item) for item in list_messages(session, user, chat_id)],
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
    return MessageResponse.model_validate(message)
