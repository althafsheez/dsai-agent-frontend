from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from ..agent import AgentRunner, RunnerCancelled
from ..errors import APIError
from ..models import AgentRun, ExecutionEvent, Message, User, utc_now
from ..providers import ChatTurn, LLMProvider, ProviderError
from ..schemas import EventEnvelope, RetryStart, RunResponse, RunStart
from .records import require_chat


class RunCoordinator:
    """Single-process cancellation/checkpoint state for the MVP worker."""

    def __init__(self) -> None:
        self._cancellations: dict[str, str] = {}

    def request_cancel(self, run_id: str, reason: str) -> None:
        self._cancellations[run_id] = reason

    def cancellation_reason(self, run_id: str) -> str | None:
        return self._cancellations.get(run_id)

    def clear(self, run_id: str) -> None:
        self._cancellations.pop(run_id, None)


def _validate_provider(provider: LLMProvider, model_id: str, effort: str | None) -> None:
    try:
        provider.validate_selection(model_id, effort)
    except ProviderError as exc:
        raise APIError(422, exc.code, str(exc)) from exc


def prepare_run(
    session: Session,
    user: User,
    chat_id: str,
    data: RunStart,
    provider: LLMProvider,
    previous_run_id: str | None = None,
) -> AgentRun:
    chat = require_chat(session, user, chat_id)
    _validate_provider(provider, data.model_id, data.effort)
    duplicate = session.scalar(
        select(AgentRun).where(
            AgentRun.chat_id == chat_id,
            AgentRun.client_request_id == data.client_request_id,
        )
    )
    if duplicate is not None:
        raise APIError(409, "run_already_exists", "This run request already exists.", {"run_id": duplicate.id})
    active = session.scalar(
        select(AgentRun).where(
            AgentRun.chat_id == chat_id,
            AgentRun.status.in_(("queued", "running")),
        )
    )
    if active is not None:
        raise APIError(409, "run_active", "A run is already active for this chat.", {"run_id": active.id})
    user_message = session.get(Message, data.user_message_id)
    if user_message is None or user_message.chat_id != chat_id or user_message.role != "user":
        raise APIError(422, "invalid_user_message", "Run must reference an existing user message in this chat.")

    position = (session.scalar(select(func.max(Message.position)).where(Message.chat_id == chat_id)) or 0) + 1
    assistant = Message(
        chat_id=chat_id,
        role="assistant",
        content="",
        status="running",
        position=position,
        client_request_id=f"assistant:{data.client_request_id}",
    )
    session.add(assistant)
    session.flush()
    run = AgentRun(
        chat_id=chat_id,
        user_message_id=user_message.id,
        assistant_message_id=assistant.id,
        status="queued",
        model_id=data.model_id,
        effort=data.effort,
        client_request_id=data.client_request_id,
        previous_run_id=previous_run_id,
    )
    session.add(run)
    if chat.first_run_at is None:
        chat.first_run_at = utc_now()
    session.commit()
    session.refresh(run)
    return run


def prepare_retry(
    session: Session,
    user: User,
    old_run: AgentRun,
    data: RetryStart,
    provider: LLMProvider,
) -> AgentRun:
    require_chat(session, user, old_run.chat_id)
    if old_run.status in ("queued", "running"):
        raise APIError(409, "run_active", "An active run cannot be retried.")
    start = RunStart(
        user_message_id=old_run.user_message_id,
        model_id=data.model_id or old_run.model_id,
        effort=data.effort if data.effort is not None else old_run.effort,
        client_request_id=data.client_request_id,
    )
    return prepare_run(session, user, old_run.chat_id, start, provider, previous_run_id=old_run.id)


def _persist_event(session: Session, run_id: str, event_type: str, data: dict) -> ExecutionEvent:
    sequence = (session.scalar(select(func.max(ExecutionEvent.sequence)).where(ExecutionEvent.run_id == run_id)) or 0) + 1
    event = ExecutionEvent(run_id=run_id, sequence=sequence, type=event_type, data=data)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _sse(event: ExecutionEvent) -> str:
    envelope = EventEnvelope(
        event_id=event.event_id,
        run_id=event.run_id,
        type=event.type,
        data=event.data,
        timestamp=event.timestamp,
        sequence=event.sequence,
    )
    payload = envelope.model_dump_json()
    return f"id: {event.event_id}\nevent: {event.type}\ndata: {payload}\n\n"


def _history(session: Session, run: AgentRun) -> list[ChatTurn]:
    user_message = session.get(Message, run.user_message_id)
    if user_message is None:
        raise RuntimeError("Run user message no longer exists.")
    messages = session.scalars(
        select(Message)
        .where(
            Message.chat_id == run.chat_id,
            Message.position <= user_message.position,
            Message.kind == "normal",
            Message.status.in_(("completed", "running")),
        )
        .order_by(Message.position)
    )
    return [ChatTurn(role=message.role, content=message.content) for message in messages if message.content]


def _finalize_cancelled(session: Session, run: AgentRun, reason: str) -> ExecutionEvent:
    interrupted = reason in ("navigation", "refresh", "disconnect")
    run.status = "interrupted" if interrupted else "cancelled"
    run.finished_at = utc_now()
    assistant = session.get(Message, run.assistant_message_id)
    if assistant is not None:
        assistant.status = run.status
    session.commit()
    return _persist_event(
        session,
        run.id,
        "agent.interrupted" if interrupted else "agent.cancelled",
        {"run_id": run.id, "reason": reason},
    )


async def stream_run(
    session_factory: sessionmaker[Session],
    run_id: str,
    runner: AgentRunner,
    coordinator: RunCoordinator,
) -> AsyncIterator[str]:
    try:
        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is None:
                return
            run.status = "running"
            run.started_at = utc_now()
            assistant = session.get(Message, run.assistant_message_id)
            session.commit()
            started = _persist_event(
                session,
                run.id,
                "agent.started",
                {"run": RunResponse.model_validate(run).model_dump(mode="json")},
            )
            yield _sse(started)
            if assistant is not None:
                created = _persist_event(
                    session,
                    run.id,
                    "message.created",
                    {"message_id": assistant.id, "role": "assistant"},
                )
                yield _sse(created)
            history = _history(session, run)

        async for runner_event in runner.run(
            history,
            run.model_id,
            run.effort,
            lambda: coordinator.cancellation_reason(run_id) is not None,
        ):
            with session_factory() as session:
                run = session.get(AgentRun, run_id)
                if run is None:
                    return
                assistant = session.get(Message, run.assistant_message_id)
                if assistant is None:
                    raise RuntimeError("Assistant message no longer exists.")
                text = str(runner_event.data["text"])
                assistant.content += text
                session.commit()
                event = _persist_event(
                    session,
                    run.id,
                    runner_event.type,
                    {"message_id": assistant.id, "text": text},
                )
                yield _sse(event)

        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is None:
                return
            reason = coordinator.cancellation_reason(run_id)
            if reason:
                yield _sse(_finalize_cancelled(session, run, reason))
                return
            assistant = session.get(Message, run.assistant_message_id)
            run.status = "completed"
            run.finished_at = utc_now()
            if assistant is not None:
                assistant.status = "completed"
            session.commit()
            if assistant is not None:
                completed_message = _persist_event(
                    session,
                    run.id,
                    "message.completed",
                    {"message_id": assistant.id, "content": assistant.content, "status": assistant.status},
                )
                yield _sse(completed_message)
            completed = _persist_event(session, run.id, "agent.completed", {"run_id": run.id})
            yield _sse(completed)
    except RunnerCancelled:
        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is not None:
                reason = coordinator.cancellation_reason(run_id) or "user"
                yield _sse(_finalize_cancelled(session, run, reason))
    except ProviderError as exc:
        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is not None:
                run.status = "failed"
                run.finished_at = utc_now()
                run.error_code = exc.code
                run.error_detail = str(exc)
                assistant = session.get(Message, run.assistant_message_id)
                if assistant is not None:
                    assistant.status = "failed"
                session.commit()
                failed = _persist_event(
                    session,
                    run.id,
                    "agent.failed",
                    {"run_id": run.id, "error": {"code": exc.code, "message": str(exc)}},
                )
                yield _sse(failed)
    except Exception:
        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is not None:
                run.status = "failed"
                run.finished_at = utc_now()
                run.error_code = "agent_error"
                run.error_detail = "Agent execution failed."
                assistant = session.get(Message, run.assistant_message_id)
                if assistant is not None:
                    assistant.status = "failed"
                session.commit()
                failed = _persist_event(
                    session,
                    run.id,
                    "agent.failed",
                    {
                        "run_id": run.id,
                        "error": {"code": "agent_error", "message": "Agent execution failed."},
                    },
                )
                yield _sse(failed)
    except asyncio.CancelledError:
        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is not None and run.status in ("queued", "running"):
                _finalize_cancelled(session, run, "disconnect")
        raise
    finally:
        coordinator.clear(run_id)


def reconcile_stale_runs(session: Session) -> None:
    now = utc_now()
    for run in session.scalars(select(AgentRun).where(AgentRun.status == "running")):
        run.status = "interrupted"
        run.finished_at = now
        run.error_code = "backend_restart"
        run.error_detail = "Run was interrupted by a backend restart."
    for run in session.scalars(select(AgentRun).where(AgentRun.status == "queued")):
        run.status = "cancelled"
        run.finished_at = now
        run.error_code = "backend_restart"
        run.error_detail = "Queued run was cancelled by a backend restart."
    session.commit()
