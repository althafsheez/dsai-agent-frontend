from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from ..agent import AgentRunner, RunnerCancelled
from ..agent.tools import ToolContext
from ..errors import APIError
from ..models import AgentRun, Chat, ExecutionEvent, Message, SteeringInstruction, User, utc_now
from ..providers import ChatTurn, LLMProvider, ProviderError
from ..schemas import EventEnvelope, QueueStart, RetryStart, RunResponse, RunStart, SteerStart
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


def prepare_queued_run(
    session: Session,
    user: User,
    active_run: AgentRun,
    data: QueueStart,
    provider: LLMProvider,
) -> tuple[Message, AgentRun, int]:
    require_chat(session, user, active_run.chat_id)
    if active_run.status != "running":
        raise APIError(409, "run_not_active", "Questions can only be queued while a run is active.")
    _validate_provider(provider, data.model_id, data.effort)
    duplicate = session.scalar(
        select(AgentRun).where(
            AgentRun.chat_id == active_run.chat_id,
            AgentRun.client_request_id == data.client_request_id,
        )
    )
    if duplicate is not None:
        message = session.get(Message, duplicate.user_message_id)
        if message is None:
            raise RuntimeError("Queued run user message no longer exists.")
        position = session.scalar(
            select(func.count()).select_from(AgentRun).where(
                AgentRun.chat_id == active_run.chat_id,
                AgentRun.status == "queued",
                AgentRun.created_at <= duplicate.created_at,
            )
        ) or 1
        return message, duplicate, position

    next_position = (session.scalar(select(func.max(Message.position)).where(Message.chat_id == active_run.chat_id)) or 0) + 1
    user_message = Message(
        chat_id=active_run.chat_id,
        role="user",
        kind="normal",
        content=data.content,
        status="queued",
        position=next_position,
        client_request_id=data.client_request_id,
    )
    assistant = Message(
        chat_id=active_run.chat_id,
        role="assistant",
        kind="normal",
        content="",
        status="queued",
        position=next_position + 1,
        client_request_id=f"assistant:{data.client_request_id}",
    )
    session.add_all((user_message, assistant))
    session.flush()
    queued_run = AgentRun(
        chat_id=active_run.chat_id,
        user_message_id=user_message.id,
        assistant_message_id=assistant.id,
        status="queued",
        model_id=data.model_id,
        effort=data.effort,
        client_request_id=data.client_request_id,
    )
    session.add(queued_run)
    session.commit()
    position = session.scalar(
        select(func.count()).select_from(AgentRun).where(
            AgentRun.chat_id == active_run.chat_id,
            AgentRun.status == "queued",
        )
    ) or 1
    return user_message, queued_run, position


def prepare_steering(
    session: Session,
    user: User,
    active_run: AgentRun,
    data: SteerStart,
) -> SteeringInstruction:
    require_chat(session, user, active_run.chat_id)
    if active_run.status != "running":
        raise APIError(409, "run_not_active", "Steering is only available while a run is active.")
    duplicate_message = session.scalar(
        select(Message).where(
            Message.chat_id == active_run.chat_id,
            Message.client_request_id == data.client_request_id,
        )
    )
    if duplicate_message is not None:
        duplicate = session.scalar(
            select(SteeringInstruction).where(SteeringInstruction.message_id == duplicate_message.id)
        )
        if duplicate is not None:
            return duplicate
    position = (session.scalar(select(func.max(Message.position)).where(Message.chat_id == active_run.chat_id)) or 0) + 1
    message = Message(
        chat_id=active_run.chat_id,
        role="user",
        kind="steering",
        content=data.content,
        status="completed",
        position=position,
        client_request_id=data.client_request_id,
    )
    session.add(message)
    session.flush()
    instruction = SteeringInstruction(run_id=active_run.id, message_id=message.id, status="received")
    session.add(instruction)
    session.commit()
    _persist_event(
        session,
        active_run.id,
        "steer.received",
        {"instruction": _instruction_data(instruction)},
    )
    return instruction


def _persist_event(session: Session, run_id: str, event_type: str, data: dict) -> ExecutionEvent:
    sequence = (session.scalar(select(func.max(ExecutionEvent.sequence)).where(ExecutionEvent.run_id == run_id)) or 0) + 1
    event = ExecutionEvent(run_id=run_id, sequence=sequence, type=event_type, data=data)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _instruction_data(instruction: SteeringInstruction) -> dict:
    return {
        "id": instruction.id,
        "run_id": instruction.run_id,
        "message_id": instruction.message_id,
        "status": instruction.status,
        "checkpoint": instruction.checkpoint,
        "created_at": instruction.created_at.isoformat(),
    }


def _apply_received_steering(
    session: Session,
    run: AgentRun,
    checkpoint: str,
) -> tuple[list[str], list[ExecutionEvent]]:
    instructions = list(session.scalars(
        select(SteeringInstruction)
        .where(SteeringInstruction.run_id == run.id, SteeringInstruction.status == "received")
        .order_by(SteeringInstruction.created_at, SteeringInstruction.id)
    ))
    contents: list[str] = []
    events: list[ExecutionEvent] = []
    for instruction in instructions:
        message = session.get(Message, instruction.message_id)
        if message is None:
            continue
        instruction.status = "applied"
        instruction.checkpoint = checkpoint
        contents.append(message.content)
        session.commit()
        events.append(_persist_event(
            session,
            run.id,
            "steer.applied",
            {"instruction": _instruction_data(instruction)},
        ))
    return contents, events


def _mark_unapplied_steering(session: Session, run: AgentRun) -> list[ExecutionEvent]:
    instructions = list(session.scalars(
        select(SteeringInstruction)
        .where(SteeringInstruction.run_id == run.id, SteeringInstruction.status == "received")
        .order_by(SteeringInstruction.created_at, SteeringInstruction.id)
    ))
    events: list[ExecutionEvent] = []
    for instruction in instructions:
        instruction.status = "unapplied"
        instruction.checkpoint = "run.completed"
        session.commit()
        events.append(_persist_event(
            session,
            run.id,
            "steer.unapplied",
            {"instruction": _instruction_data(instruction)},
        ))
    return events


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
    user_message = session.get(Message, run.user_message_id)
    if assistant is not None:
        assistant.status = run.status
    if user_message is not None:
        user_message.status = run.status
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
            user_message = session.get(Message, run.user_message_id)
            assistant = session.get(Message, run.assistant_message_id)
            if user_message is not None:
                user_message.status = "running"
            if assistant is not None:
                assistant.status = "running"
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
            chat = session.get(Chat, run.chat_id)
            if chat is None:
                raise RuntimeError("Run chat no longer exists.")
            tool_context = ToolContext(run_id=run.id, chat_id=run.chat_id, user_id=chat.created_by)

        while True:
            steered = False
            generation = runner.run(
                history,
                run.model_id,
                run.effort,
                lambda: coordinator.cancellation_reason(run_id) is not None,
                tool_context,
            )
            async for runner_event in generation:
                with session_factory() as session:
                    run = session.get(AgentRun, run_id)
                    if run is None:
                        return
                    assistant = session.get(Message, run.assistant_message_id)
                    if assistant is None:
                        raise RuntimeError("Assistant message no longer exists.")
                    if runner_event.type == "message.delta":
                        text = str(runner_event.data["text"])
                        assistant.content += text
                        session.commit()
                        event_data = {"message_id": assistant.id, "text": text}
                    else:
                        event_data = runner_event.data
                    event = _persist_event(session, run.id, runner_event.type, event_data)
                    yield _sse(event)
                    if runner_event.type == "tool.completed":
                        output = runner_event.data.get("output")
                        resources = output.get("resources", []) if isinstance(output, dict) else []
                        for resource in resources:
                            resource_type = resource.get("resource_type") if isinstance(resource, dict) else None
                            if resource_type in ("dataset", "artifact"):
                                created = _persist_event(
                                    session,
                                    run.id,
                                    f"{resource_type}.created",
                                    {resource_type: resource, "scope": {"type": "chat", "id": run.chat_id}},
                                )
                                yield _sse(created)
                    if runner_event.type == "tool.completed" and not assistant.content:
                        steering, steering_events = _apply_received_steering(session, run, runner_event.type)
                        for steering_event in steering_events:
                            yield _sse(steering_event)
                        if steering:
                            history = [
                                *history,
                                ChatTurn(role="user", content="Steering instruction: " + "\n".join(steering)),
                            ]
                            steered = True
                if steered:
                    break
            if steered:
                continue
            with session_factory() as session:
                run = session.get(AgentRun, run_id)
                if run is None:
                    return
                steering_events = _mark_unapplied_steering(session, run)
                for steering_event in steering_events:
                    yield _sse(steering_event)
            break

        with session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is None:
                return
            reason = coordinator.cancellation_reason(run_id)
            if reason:
                yield _sse(_finalize_cancelled(session, run, reason))
                return
            assistant = session.get(Message, run.assistant_message_id)
            user_message = session.get(Message, run.user_message_id)
            run.status = "completed"
            run.finished_at = utc_now()
            if user_message is not None:
                user_message.status = "completed"
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
            next_run = session.scalar(
                select(AgentRun)
                .where(AgentRun.chat_id == run.chat_id, AgentRun.status == "queued")
                .order_by(AgentRun.created_at, AgentRun.id)
            )
        if next_run is not None:
            async for queued_event in stream_run(session_factory, next_run.id, runner, coordinator):
                yield queued_event
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
                user_message = session.get(Message, run.user_message_id)
                if assistant is not None:
                    assistant.status = "failed"
                if user_message is not None:
                    user_message.status = "failed"
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
                user_message = session.get(Message, run.user_message_id)
                if assistant is not None:
                    assistant.status = "failed"
                if user_message is not None:
                    user_message.status = "failed"
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
