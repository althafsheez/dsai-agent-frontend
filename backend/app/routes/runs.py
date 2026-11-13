from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import AgentRun, ExecutionEvent, Message, User, utc_now
from ..schemas import (
    CancelRun,
    EventEnvelope,
    MessageResponse,
    QueueResponse,
    QueueStart,
    RetryStart,
    RunResponse,
    RunStart,
    SteerResponse,
    SteerStart,
    SteeringInstructionResponse,
)
from ..services.records import require_chat
from ..services.runs import prepare_queued_run, prepare_retry, prepare_run, prepare_steering, stream_run


router = APIRouter(tags=["runs"])


def _stream_response(request: Request, run: AgentRun) -> StreamingResponse:
    return StreamingResponse(
        stream_run(
            request.app.state.session_factory,
            run.id,
            request.app.state.runner,
            request.app.state.run_coordinator,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _prepare(
    chat_id: str,
    data: RunStart,
    request: Request,
    session: Session,
    user: User,
) -> StreamingResponse:
    run = prepare_run(session, user, chat_id, data, request.app.state.provider)
    return _stream_response(request, run)


@router.post("/api/chats/{chat_id}/messages/stream")
async def stream_message_run(
    chat_id: str,
    data: RunStart,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    return _prepare(chat_id, data, request, session, user)


@router.post("/api/chats/{chat_id}/runs")
async def stream_compatibility_run(
    chat_id: str,
    data: RunStart,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Compatibility path for the initial brief; payload/SSE follow the final contract."""
    return _prepare(chat_id, data, request, session, user)


@router.post("/api/chats/{chat_id}/queue/resume/stream")
async def resume_queue(
    chat_id: str,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    require_chat(session, user, chat_id)
    queued_run = session.scalar(
        select(AgentRun)
        .where(AgentRun.chat_id == chat_id, AgentRun.status == "queued")
        .order_by(AgentRun.created_at, AgentRun.id)
    )
    if queued_run is None:
        raise APIError(409, "queue_empty", "There are no queued questions to resume.")
    return _stream_response(request, queued_run)


@router.get("/api/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RunResponse:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    require_chat(session, user, run.chat_id)
    return RunResponse.model_validate(run)


@router.get("/api/chats/{chat_id}/runs")
async def get_chat_runs(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_chat(session, user, chat_id)
    runs = session.scalars(
        select(AgentRun).where(AgentRun.chat_id == chat_id).order_by(AgentRun.created_at, AgentRun.id)
    )
    return {"items": [RunResponse.model_validate(run) for run in runs], "next_cursor": None}


@router.get("/api/runs/{run_id}/events")
async def get_run_events(
    run_id: str,
    after_sequence: int = 0,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    require_chat(session, user, run.chat_id)
    events = session.scalars(
        select(ExecutionEvent)
        .where(ExecutionEvent.run_id == run_id, ExecutionEvent.sequence > after_sequence)
        .order_by(ExecutionEvent.sequence)
    )
    return {
        "items": [
            EventEnvelope(
                event_id=event.event_id,
                run_id=event.run_id,
                type=event.type,
                data=event.data,
                timestamp=event.timestamp,
                sequence=event.sequence,
            )
            for event in events
        ],
        "next_cursor": None,
    }


@router.post("/api/runs/{run_id}/retry/stream")
async def retry_run(
    run_id: str,
    data: RetryStart,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    old_run = session.get(AgentRun, run_id)
    if old_run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    run = prepare_retry(session, user, old_run, data, request.app.state.provider)
    return _stream_response(request, run)


@router.post("/api/runs/{run_id}/queue", response_model=QueueResponse, status_code=status.HTTP_201_CREATED)
async def queue_run(
    run_id: str,
    data: QueueStart,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QueueResponse:
    active_run = session.get(AgentRun, run_id)
    if active_run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    message, queued_run, position = prepare_queued_run(
        session, user, active_run, data, request.app.state.provider
    )
    return QueueResponse(
        message=MessageResponse.model_validate(message),
        run=RunResponse.model_validate(queued_run),
        position=position,
    )


@router.delete("/api/runs/{run_id}/queue", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_queued_run(
    run_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    require_chat(session, user, run.chat_id)
    if run.status != "queued":
        raise APIError(409, "run_not_queued", "Only a queued run can be removed from the queue.")
    run.status = "cancelled"
    run.finished_at = utc_now()
    for message_id in (run.user_message_id, run.assistant_message_id):
        message = session.get(Message, message_id)
        if message is not None:
            message.status = "cancelled"
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/runs/{run_id}/steer", response_model=SteerResponse, status_code=status.HTTP_201_CREATED)
async def steer_run(
    run_id: str,
    data: SteerStart,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SteerResponse:
    active_run = session.get(AgentRun, run_id)
    if active_run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    instruction = prepare_steering(session, user, active_run, data)
    return SteerResponse(instruction=SteeringInstructionResponse.model_validate(instruction))


@router.post("/api/runs/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(
    run_id: str,
    data: CancelRun,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    require_chat(session, user, run.chat_id)
    if run.status in ("queued", "running"):
        request.app.state.run_coordinator.request_cancel(run.id, data.reason)
    return {"run_id": run.id, "status": "cancellation_requested"}
