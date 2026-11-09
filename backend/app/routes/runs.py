from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import AgentRun, ExecutionEvent, User
from ..schemas import CancelRun, EventEnvelope, RetryStart, RunResponse, RunStart
from ..services.records import require_chat
from ..services.runs import prepare_retry, prepare_run, stream_run


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
