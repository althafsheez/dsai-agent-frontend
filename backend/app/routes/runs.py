from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import AgentRun, ExecutionEvent, Message, ResourceLink, User, utc_now
from ..schemas import (
    CancelRun,
    EventEnvelope,
    MessageResponse,
    QueueOrder,
    QueueResponse,
    QueueStart,
    QueueUpdate,
    RetryStart,
    RunResponse,
    RunStart,
    SteerResponse,
    SteerStart,
    SteeringInstructionResponse,
)
from ..services.records import message_response, require_chat
from ..services.resource_uploads import read_upload, register_upload
from ..services.runs import (
    execute_run_in_background,
    prepare_queued_run,
    prepare_retry,
    prepare_run,
    prepare_steering,
    queued_runs_query,
    reorder_queued_runs,
    stream_persisted_events,
)


router = APIRouter(tags=["runs"])


def _stream_response(request: Request, run: AgentRun) -> StreamingResponse:
    request.app.state.run_coordinator.start(
        run.id,
        execute_run_in_background(
            request.app.state.session_factory,
            run.id,
            request.app.state.runner,
            request.app.state.run_coordinator,
        ),
    )
    return StreamingResponse(
        stream_persisted_events(request.app.state.session_factory, run.id),
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
    queued_run = session.scalar(queued_runs_query(chat_id).limit(1))
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
        message=message_response(session, message),
        run=RunResponse.model_validate(queued_run),
        position=position,
    )


@router.post("/api/runs/{run_id}/queue/with-files", response_model=QueueResponse, status_code=status.HTTP_201_CREATED)
async def queue_run_with_files(
    run_id: str,
    request: Request,
    files: list[UploadFile] = File(...),
    content: str = Form(min_length=1, max_length=100_000),
    model_id: str = Form(...),
    client_request_id: str = Form(min_length=1, max_length=100),
    effort: str | None = Form(default=None),
    resource_ids: list[str] = Form(default=[]),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QueueResponse:
    active_run = session.get(AgentRun, run_id)
    if active_run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    chat_id = active_run.chat_id
    require_chat(session, user, chat_id)
    uploads = [await read_upload(file) for file in files]
    session.refresh(active_run)
    data = QueueStart(
        content=content, model_id=model_id, client_request_id=client_request_id,
        effort=effort, resource_ids=resource_ids,
    )

    def register_files(message: Message) -> None:
        for upload in uploads:
            register_upload(
                session, request.app.state.storage, upload, user_id=user.id, scope_type="chat",
                scope_id=chat_id, message_id=message.id, client_upload_id=None,
            )

    message, queued_run, position = prepare_queued_run(
        session, user, active_run, data, request.app.state.provider, register_files,
    )
    return QueueResponse(
        message=message_response(session, message), run=RunResponse.model_validate(queued_run), position=position,
    )


def _require_queued_message(session: Session, user: User, run_id: str) -> Message:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise APIError(404, "run_not_found", "Run not found.")
    require_chat(session, user, run.chat_id)
    if run.status != "queued":
        raise APIError(409, "run_not_queued", "Only queued questions can be edited.")
    message = session.get(Message, run.user_message_id)
    if message is None:
        raise APIError(404, "message_not_found", "Queued question not found.")
    if message.status != "queued":
        raise APIError(409, "run_not_queued", "Only queued questions can be edited.")
    return message


def _save_queued_edit(session: Session, message: Message, data: QueueUpdate) -> MessageResponse:
    content = data.content.strip()
    if not content:
        raise APIError(422, "empty_message", "Message content cannot be blank.")
    message.content = content
    if data.remove_resource_ids:
        session.execute(delete(ResourceLink).where(
            ResourceLink.message_id == message.id,
            ResourceLink.resource_id.in_(data.remove_resource_ids),
        ))
    session.commit()
    return message_response(session, message)


@router.patch("/api/runs/{run_id}/queue", response_model=MessageResponse)
async def edit_queued_run(
    run_id: str,
    data: QueueUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    return _save_queued_edit(session, _require_queued_message(session, user, run_id), data)


@router.patch("/api/runs/{run_id}/queue/with-files", response_model=MessageResponse)
async def edit_queued_run_with_files(
    run_id: str,
    request: Request,
    files: list[UploadFile] = File(...),
    client_upload_ids: list[str] = Form(...),
    content: str = Form(min_length=1, max_length=100_000),
    remove_resource_ids: list[str] = Form(default=[]),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    _require_queued_message(session, user, run_id)
    if len(files) != len(client_upload_ids) or len(set(client_upload_ids)) != len(files):
        raise APIError(422, "invalid_upload_ids", "Each file requires a distinct upload ID.")
    if any(not upload_id or len(upload_id) > 100 for upload_id in client_upload_ids):
        raise APIError(422, "invalid_upload_ids", "Upload IDs must be between 1 and 100 characters.")
    content = content.strip()
    if not content:
        raise APIError(422, "empty_message", "Message content cannot be blank.")
    session.rollback()
    uploads = [await read_upload(file) for file in files]
    # The preceding run may have finished while the files were being read.
    message = _require_queued_message(session, user, run_id)
    existing_ids = set(session.scalars(select(ResourceLink.client_upload_id).where(
        ResourceLink.message_id == message.id,
        ResourceLink.client_upload_id.in_(client_upload_ids),
    )))
    for upload_id, upload in zip(client_upload_ids, uploads, strict=True):
        if upload_id not in existing_ids:
            register_upload(
                session, request.app.state.storage, upload, user_id=user.id, scope_type="chat",
                scope_id=message.chat_id, message_id=message.id, client_upload_id=upload_id,
            )
    data = QueueUpdate(content=content, remove_resource_ids=remove_resource_ids)
    return _save_queued_edit(session, message, data)


@router.patch("/api/chats/{chat_id}/queue/order", status_code=status.HTTP_204_NO_CONTENT)
async def update_queue_order(
    chat_id: str,
    data: QueueOrder,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    require_chat(session, user, chat_id)
    reorder_queued_runs(session, chat_id, data.run_ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
