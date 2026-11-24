from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from agentic.runtime.contracts import ProviderError

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import User, WorkflowDefinition, WorkflowRunRecord
from ..services import action_builder, workflow_ai, workflow_engine

router = APIRouter(prefix="/api/workflow-store", tags=["workflows"])


class WorkflowInput(BaseModel):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(max_length=160)
    description: str = Field(default="", max_length=2000)
    prompt: str = Field(default="", max_length=4000)
    state: str = Field(default="draft", pattern="^(draft|active|inactive)$")
    trigger: dict[str, Any]
    steps: list[dict[str, Any]] = Field(default_factory=list, max_length=40)


class StateInput(BaseModel):
    state: str = Field(pattern="^(draft|active|inactive)$")


class TestRunInput(BaseModel):
    steps: list[dict[str, Any]] = Field(min_length=1, max_length=40)


class AiInput(BaseModel):
    prompt: str = Field(default="", max_length=4000)
    dataset_ids: list[str] = Field(default_factory=list, max_length=8)
    steps: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    model_id: str
    effort: str | None = None


def _iso(value: datetime | None) -> str | None:
    """SQLite hands datetimes back without a zone; they are all UTC, and the browser must be told so."""
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _workflow(item: WorkflowDefinition) -> dict:
    return {
        "id": item.id, "name": item.name, "description": item.description, "prompt": item.prompt, "state": item.state,
        "trigger": item.trigger, "steps": item.steps,
        "schedule": workflow_engine.schedule_label((item.trigger or {}).get("config") or {}) if (item.trigger or {}).get("kind") == "schedule" else "Run by hand",
        "next_run_at": _iso(item.next_run_at),
        "last_run_at": _iso(item.last_run_at),
        "created_at": _iso(item.created_at), "updated_at": _iso(item.updated_at),
    }


def _run(item: WorkflowRunRecord) -> dict:
    return {
        "id": item.id, "workflow_id": item.workflow_id, "workflow_name": item.workflow_name, "trigger": item.trigger,
        "status": item.status, "results": item.results, "error": item.error,
        "started_at": _iso(item.started_at),
        "finished_at": _iso(item.finished_at),
        "cancelled_at": _iso(item.cancelled_at),
    }


def _own(db: Session, user: User, workflow_id: str) -> WorkflowDefinition:
    item = db.get(WorkflowDefinition, workflow_id)
    if item is None or item.owner_id != user.id:
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    return item


def _own_run(db: Session, user: User, run_id: str) -> WorkflowRunRecord:
    item = db.get(WorkflowRunRecord, run_id)
    owner = db.get(WorkflowDefinition, item.workflow_id) if item else None
    if item is None or owner is None or owner.owner_id != user.id:
        raise APIError(404, "run_not_found", "Run not found.")
    return item


@router.get("")
def list_workflows(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    items = db.scalars(select(WorkflowDefinition).where(WorkflowDefinition.owner_id == user.id).order_by(WorkflowDefinition.updated_at.desc())).all()
    return {"items": [_workflow(item) for item in items]}


@router.put("")
def save_workflow(data: WorkflowInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowDefinition, data.id) if data.id else None
    if item is not None and item.owner_id != user.id:
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    if item is not None and item.state == "active":
        raise APIError(409, "workflow_active", "Pause the published workflow before saving changes.")
    if data.state == "active":
        _require_runnable_steps(data.steps)
    connections = request.app.state.connections
    steps = []
    for step in data.steps:
        config = step.get("config")
        if step.get("kind") == "data" and isinstance(config, dict) and config.get("action") is not None:
            action = action_builder.from_step(step)
            action_builder.check_action(connections, db, user, action)
            action = action_builder.with_test_status(connections, user, action, action.test_receipt)
            step = {**step, "config": {**config, "action": action.model_dump()}}
        steps.append(step)
    if item is None:
        item = WorkflowDefinition(owner_id=user.id)
        if data.id:
            item.id = data.id
        db.add(item)
    item.name = data.name.strip() or "Untitled workflow"
    item.description = data.description.strip()
    item.prompt = data.prompt.strip()
    item.state = data.state
    item.trigger = data.trigger
    item.steps = steps
    workflow_engine.refresh_schedule(item)
    db.commit()
    return _workflow(item)


@router.get("/runs")
def list_runs(workflow_id: str | None = None, limit: int = 100, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    mine = set(db.scalars(select(WorkflowDefinition.id).where(WorkflowDefinition.owner_id == user.id)))
    query = select(WorkflowRunRecord).order_by(WorkflowRunRecord.started_at.desc()).limit(min(max(limit, 1), 300))
    if workflow_id:
        query = query.where(WorkflowRunRecord.workflow_id == workflow_id)
    return {"items": [_run(item) for item in db.scalars(query) if item.workflow_id in mine]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return _run(_own_run(db, user, run_id))


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = _own_run(db, user, run_id)
    if item.status == "running":
        item.cancelled_at = datetime.now(timezone.utc)
        db.commit()
    return _run(item)


def _briefs(request: Request, db: Session, user: User, dataset_ids: list[str]) -> list[dict[str, Any]]:
    loaded = [item for item in (workflow_engine.load_dataset(db, request.app.state.storage, user.id, dataset_id) for dataset_id in dataset_ids) if item]
    return [{"id": d["id"], "name": d["name"], "columns": [{"name": name} for name in d["columns"]], "rows": d["rows"][:4], "row_count": len(d["rows"])} for d in loaded]


def _checked(request: Request, data: AiInput) -> None:
    try:
        request.app.state.provider.validate_selection(data.model_id, data.effort)
    except ProviderError as exc:
        raise APIError(422, exc.code, str(exc)) from exc


@router.post("/ai/rephrase")
async def ai_rephrase(data: AiInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if len(data.prompt.strip()) < 3:
        raise APIError(422, "prompt_required", "Write what the workflow should do first.")
    _checked(request, data)
    try:
        return {"prompt": await workflow_ai.rephrase(request.app.state.provider, data.prompt.strip(), _briefs(request, db, user, data.dataset_ids), data.model_id, data.effort)}
    except ProviderError as exc:
        raise APIError(502, "workflow_ai_failed", str(exc)) from exc


@router.post("/ai/plan")
async def ai_plan(data: AiInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """A prompt in, a runnable set of steps out (shown as the flow diagram)."""
    if len(data.prompt.strip()) < 3:
        raise APIError(422, "prompt_required", "Write what the workflow should do first.")
    _checked(request, data)
    try:
        result = await workflow_ai.plan(request.app.state.provider, data.prompt.strip(), _briefs(request, db, user, data.dataset_ids), data.model_id, data.effort)
    except ProviderError as exc:
        raise APIError(502, "workflow_ai_failed", str(exc)) from exc
    for step in result["steps"]:
        if step["kind"] == "data":
            step["config"] = {**step["config"], "dataset_ids": data.dataset_ids}
    return result


@router.post("/ai/build")
async def ai_build(data: AiInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Hand-made steps in: the AI writes and test-runs a Python script for each script step, so the workflow runs on its own every time."""
    _checked(request, data)
    loaded = [item for item in (workflow_engine.load_dataset(db, request.app.state.storage, user.id, dataset_id) for dataset_id in data.dataset_ids) if item]
    if not loaded:
        raise APIError(422, "dataset_required", "Choose at least one dataset so the script can be tested on real data.")
    if len(loaded) != len(data.dataset_ids):
        raise APIError(422, "dataset_unavailable", "One or more selected datasets could not be read.")
    steps, notes = await workflow_ai.build_scripts(request.app.state.provider, data.steps, loaded, data.model_id, data.effort)
    return {"steps": steps, "notes": notes}


@router.post("/actions/generate")
async def generate_action(data: action_builder.BuildActionInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return await action_builder.build(request.app.state.connections, db, user, request.app.state.provider, data)


@router.post("/actions/test")
async def test_action(action: action_builder.ActionDefinition, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    connections = request.app.state.connections
    started = perf_counter()
    try:
        adapter = action_builder.check_action(connections, db, user, action)
        result = await adapter.execute(action.arguments)
    except APIError as exc:
        code = (exc.details or {}).get("sqlstate") or exc.code
        return {
            "status": "failed", "error": exc.message, "code": code,
            "duration_ms": round((perf_counter() - started) * 1000), "logs": [f"{code}: {exc.message}"],
        }
    count = result["row_count"]
    return {"status": "passed", "duration_ms": result["duration_ms"], "result": result,
            "logs": [f"Read-only query returned {count} rows."], "receipt": action_builder.test_receipt(connections, user, action)}


@router.post("/actions/apply")
def apply_action(data: action_builder.ApplyActionInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    connections = request.app.state.connections
    action_builder.check_action(connections, db, user, data.action)
    return action_builder.with_test_status(connections, user, data.action, data.test_receipt).model_dump()


def _require_runnable_steps(steps: list[dict[str, Any]]) -> None:
    if any(step.get("kind") == "human" for step in steps):
        raise APIError(422, "human_review_unavailable", "Workflows with Human Review steps can only be saved as drafts.")
    for step in steps:
        config = step.get("config")
        if step.get("kind") == "data" and isinstance(config, dict) and config.get("connection_id"):
            action = action_builder.from_step(step)
            if action.provider not in action_builder.ADAPTERS:
                raise APIError(422, "workflow_connector_unavailable", "This extension does not support workflow actions.")


@router.post("/{workflow_id}/run", status_code=201)
async def run_now(workflow_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = _own(db, user, workflow_id)
    if not (item.steps or []):
        raise APIError(422, "workflow_empty", "Add a step before running.")
    _require_runnable_steps(item.steps)
    run = workflow_engine.create_run(db, item, "manual")
    workflow_engine.launch(request.app, run.id, user.id)
    return _run(run)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return _workflow(_own(db, user, workflow_id))


@router.post("/{workflow_id}/test", status_code=201)
async def test_run(workflow_id: str, data: TestRunInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = _own(db, user, workflow_id)
    _require_runnable_steps(data.steps)
    step_ids: set[str] = set()
    for step in data.steps:
        step_id, kind, config = step.get("id"), step.get("kind"), step.get("config", {})
        if (
            not isinstance(step_id, str) or not step_id or step_id in step_ids or kind not in workflow_engine.STEP_KINDS
            or not isinstance(config, dict) or not isinstance(step.get("title"), str) or not isinstance(step.get("detail"), str)
        ):
            raise APIError(422, "invalid_workflow_step", "Each test step needs a supported type, unique ID, and valid configuration.")
        step_ids.add(step_id)
    run = workflow_engine.create_run(db, item, "test", test_steps=data.steps)
    workflow_engine.launch(request.app, run.id, user.id)
    return _run(run)


@router.put("/{workflow_id}/state")
def set_state(workflow_id: str, data: StateInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = _own(db, user, workflow_id)
    if data.state == "active":
        _require_runnable_steps(item.steps or [])
    item.state = data.state
    workflow_engine.refresh_schedule(item)
    db.commit()
    return _workflow(item)


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    item = db.get(WorkflowDefinition, workflow_id)
    if item is not None and item.owner_id == user.id:
        db.execute(delete(WorkflowRunRecord).where(WorkflowRunRecord.workflow_id == workflow_id))
        db.delete(item)
        db.commit()
    return Response(status_code=204)
