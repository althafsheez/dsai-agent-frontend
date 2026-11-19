from __future__ import annotations

import json
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import Chat, Message, QuickMessage, Resource, ResourceLink, User, utc_now
from ..providers import ChatTurn, LLMProvider, ProviderError
from ..schemas import QuickMessageCreate, QuickMessageResponse
from ..services.records import require_chat, require_workspace


router = APIRouter(prefix="/api/quick-assistant", tags=["quick-assistant"])


def _require_context(session: Session, user: User, context_type: str, context_id: str) -> Chat | None:
    if context_type == "chat":
        return require_chat(session, user, context_id)
    if context_type == "workspace":
        require_workspace(session, user, context_id)
        return None
    raise APIError(422, "invalid_context", "Quick Assistant needs a chat or workspace context.")


def _messages(session: Session, user: User, context_type: str, context_id: str) -> list[QuickMessage]:
    _require_context(session, user, context_type, context_id)
    return list(session.scalars(
        select(QuickMessage)
        .where(QuickMessage.context_type == context_type, QuickMessage.context_id == context_id, QuickMessage.user_id == user.id)
        .order_by(QuickMessage.position, QuickMessage.id)
    ))


def _resource_context(session: Session, user: User, context_type: str, context_id: str, chat: Chat | None) -> str:
    scopes = [(context_type, context_id)]
    if chat is not None and chat.workspace_id:
        scopes.append(("workspace", chat.workspace_id))
    clauses = [
        (ResourceLink.scope_type == scope_type) & (ResourceLink.scope_id == scope_id)
        for scope_type, scope_id in scopes
    ]
    rows = session.execute(
        select(Resource.name, Resource.resource_type, Resource.metadata_json)
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .where(Resource.created_by == user.id, clauses[0] if len(clauses) == 1 else or_(*clauses))
        .order_by(Resource.created_at.desc())
        .limit(40)
    ).all()
    files = []
    for name, resource_type, metadata in rows:
        columns = metadata.get("columns", []) if isinstance(metadata, dict) else []
        column_names = ", ".join(str(column.get("name")) for column in columns[:12] if isinstance(column, dict) and column.get("name"))
        suffix = f" (columns: {column_names})" if column_names else ""
        preview_rows = metadata.get("preview_rows", []) if isinstance(metadata, dict) else []
        preview = f"; sample: {str(preview_rows[:3])[:800]}" if preview_rows else ""
        files.append(f"- {name} [{resource_type}]{suffix}{preview}")
    return "\n".join(files) or "No datasets or artifacts are currently available in this context."


def _main_chat_context(session: Session, chat: Chat | None, until_message_id: str | None = None) -> str:
    """Give Quick Assistant a bounded, read-only view of the main transcript up to when it was opened."""
    if chat is None:
        return "This Quick Assistant is scoped to a workspace; there is no single main chat transcript."
    query = select(Message).where(Message.chat_id == chat.id, Message.kind == "normal")
    if until_message_id is not None:
        cutoff = session.get(Message, until_message_id)
        if cutoff is not None and cutoff.chat_id == chat.id:
            query = query.where(Message.position <= cutoff.position)
    messages = list(session.scalars(query.order_by(Message.position.desc(), Message.id.desc()).limit(60)))
    if not messages:
        return "The main chat has no messages yet."
    transcript: list[str] = []
    budget = 60_000
    for message in reversed(messages):
        content = message.content.strip()
        if not content:
            continue
        excerpt = content[:4_000]
        line = f"{message.role.title()}: {excerpt}"
        if len("\n".join(transcript)) + len(line) > budget:
            break
        transcript.append(line)
    return "\n\n".join(transcript) or "The main chat has no completed text yet."


def _answered_history(history: list[QuickMessage], current_answer_id: str) -> list[QuickMessage]:
    """Earlier question/answer pairs only: a question whose answer failed would otherwise be answered again."""
    kept: list[QuickMessage] = []
    for index, item in enumerate(history):
        if item.id == current_answer_id or not item.content:
            continue
        if item.role == "user":
            answer = history[index + 1] if index + 1 < len(history) else None
            is_current = answer is not None and answer.id == current_answer_id
            if not is_current and (answer is None or answer.role != "assistant" or not answer.content):
                continue
        kept.append(item)
    return kept


def _sse(message_id: str, event_type: str, data: dict, sequence: int) -> str:
    payload = {
        "event_id": str(uuid4()), "run_id": message_id, "type": event_type,
        "data": data, "timestamp": utc_now().isoformat(), "sequence": sequence,
    }
    return f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


async def _stream_answer(request: Request, user: User, data: QuickMessageCreate, assistant_id: str) -> AsyncIterator[str]:
    session_factory = request.app.state.session_factory
    provider: LLMProvider = request.app.state.provider
    try:
        with session_factory() as session:
            chat = _require_context(session, user, data.context_type, data.context_id)
            assistant = session.get(QuickMessage, assistant_id)
            if assistant is None:
                return
            history = _messages(session, user, data.context_type, data.context_id)
            resources = _resource_context(session, user, data.context_type, data.context_id, chat)
            main_chat = _main_chat_context(session, chat, data.context_until_message_id)
            assistant.status = "running"
            session.commit()
            turns = [ChatTurn(role="user", content=(
                "You are Quick Assistant, a concise read-only companion to a data analysis. "
                "The main-chat transcript below is read-only context: you may summarize, explain, or answer questions about it, but you must never say you edited it or changed the analysis. "
                "You have no execution tools: never claim you inspected full file contents, created files, or changed the analysis. "
                "Keep answers brief for a narrow panel and refer to files by name when relevant.\n\n"
                f"Read-only main chat transcript:\n{main_chat}\n\n"
                f"Available context files:\n{resources}"
            ))]
            turns.extend(ChatTurn(role=item.role, content=item.content) for item in _answered_history(history, assistant_id))
        yield _sse(assistant_id, "message.created", {"message_id": assistant_id, "role": "assistant"}, 1)
        sequence = 1
        async for text in provider.stream_text(turns, data.model_id, data.effort):
            if not text:
                continue
            with session_factory() as session:
                assistant = session.get(QuickMessage, assistant_id)
                if assistant is None:
                    return
                assistant.content += text
                assistant.updated_at = utc_now()
                session.commit()
            sequence += 1
            yield _sse(assistant_id, "message.delta", {"message_id": assistant_id, "text": text}, sequence)
        with session_factory() as session:
            assistant = session.get(QuickMessage, assistant_id)
            if assistant is None:
                return
            assistant.status = "completed"
            assistant.updated_at = utc_now()
            session.commit()
            content = assistant.content
        sequence += 1
        yield _sse(assistant_id, "message.completed", {"message_id": assistant_id, "content": content, "status": "completed"}, sequence)
    except ProviderError as exc:
        with session_factory() as session:
            assistant = session.get(QuickMessage, assistant_id)
            if assistant is not None:
                assistant.status = "failed"
                assistant.updated_at = utc_now()
                session.commit()
        yield _sse(assistant_id, "agent.failed", {"message_id": assistant_id, "error": {"code": exc.code, "message": str(exc)}}, 99)


@router.get("/messages")
async def get_quick_messages(
    context_type: str,
    context_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {"items": [QuickMessageResponse.model_validate(item) for item in _messages(session, user, context_type, context_id)], "next_cursor": None}


@router.post("/messages/stream")
async def stream_quick_message(
    data: QuickMessageCreate,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    chat = _require_context(session, user, data.context_type, data.context_id)
    if data.context_until_message_id is not None:
        cutoff = session.get(Message, data.context_until_message_id)
        if chat is None or cutoff is None or cutoff.chat_id != chat.id:
            raise APIError(422, "invalid_context", "The Quick Assistant snapshot does not belong to this chat.")
    try:
        request.app.state.provider.validate_selection(data.model_id, data.effort)
    except ProviderError as exc:
        raise APIError(422, exc.code, str(exc)) from exc
    existing = session.scalar(select(QuickMessage).where(
        QuickMessage.context_type == data.context_type, QuickMessage.context_id == data.context_id,
        QuickMessage.user_id == user.id, QuickMessage.client_request_id == data.client_request_id,
    ))
    if existing is not None:
        raise APIError(409, "quick_message_already_exists", "This Quick Assistant question already exists.")
    position = (session.scalar(select(func.max(QuickMessage.position)).where(
        QuickMessage.context_type == data.context_type, QuickMessage.context_id == data.context_id,
        QuickMessage.user_id == user.id,
    )) or 0) + 1
    question = QuickMessage(context_type=data.context_type, context_id=data.context_id, user_id=user.id, role="user", content=data.content.strip(), status="completed", position=position, client_request_id=data.client_request_id)
    answer = QuickMessage(context_type=data.context_type, context_id=data.context_id, user_id=user.id, role="assistant", content="", status="queued", position=position + 1, client_request_id=f"assistant:{data.client_request_id}")
    session.add_all((question, answer))
    session.commit()
    return StreamingResponse(_stream_answer(request, user, data, answer.id), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
