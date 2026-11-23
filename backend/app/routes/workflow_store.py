from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import User, WorkflowDefinition, WorkflowRunRecord

router = APIRouter(prefix="/api/workflow-store", tags=["workflows"])


class WorkflowInput(BaseModel):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(max_length=160)
    description: str = Field(default="", max_length=2000)
    state: str = Field(default="draft", pattern="^(draft|active|inactive)$")
    trigger: dict[str, Any]
    steps: list[dict[str, Any]] = Field(default_factory=list, max_length=40)


class StateInput(BaseModel):
    state: str = Field(pattern="^(draft|active|inactive)$")


class RunInput(BaseModel):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    workflow_id: str = Field(max_length=64)
    trigger: str = Field(default="manual", pattern="^(manual|schedule|event)$")
    plan: list[dict[str, Any]] = Field(max_length=60)
    started_at: datetime | None = None


def _workflow(item: WorkflowDefinition) -> dict:
    return {
        "id": item.id, "name": item.name, "description": item.description, "state": item.state,
        "trigger": item.trigger, "steps": item.steps,
        "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }


def _run(item: WorkflowRunRecord) -> dict:
    return {
        "id": item.id, "workflow_id": item.workflow_id, "workflow_name": item.workflow_name, "trigger": item.trigger,
        "plan": item.plan, "started_at": item.started_at.isoformat(),
        "cancelled_at": item.cancelled_at.isoformat() if item.cancelled_at else None,
    }


@router.get("")
def list_workflows(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    items = db.scalars(select(WorkflowDefinition).order_by(WorkflowDefinition.updated_at.desc())).all()
    return {"items": [_workflow(item) for item in items]}


@router.put("")
def save_workflow(data: WorkflowInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowDefinition, data.id) if data.id else None
    if item is None:
        item = WorkflowDefinition(owner_id=user.id)
        if data.id:
            item.id = data.id
        db.add(item)
    item.name = data.name.strip() or "Untitled workflow"
    item.description = data.description.strip()
    item.state = data.state
    item.trigger = data.trigger
    item.steps = data.steps
    db.commit()
    return _workflow(item)


@router.get("/runs")
def list_runs(workflow_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    query = select(WorkflowRunRecord).order_by(WorkflowRunRecord.started_at.desc())
    if workflow_id:
        query = query.where(WorkflowRunRecord.workflow_id == workflow_id)
    return {"items": [_run(item) for item in db.scalars(query).all()]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowRunRecord, run_id)
    if item is None:
        raise APIError(404, "run_not_found", "Run not found.")
    return _run(item)


@router.post("/runs", status_code=201)
def start_run(data: RunInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    workflow = db.get(WorkflowDefinition, data.workflow_id)
    name = workflow.name if workflow else data.id or data.workflow_id
    item = WorkflowRunRecord(
        workflow_id=data.workflow_id, workflow_name=name, trigger=data.trigger, plan=data.plan,
        started_at=data.started_at or datetime.now(timezone.utc),
    )
    if data.id:
        item.id = data.id
    db.add(item)
    db.commit()
    return _run(item)


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowRunRecord, run_id)
    if item is None:
        raise APIError(404, "run_not_found", "Run not found.")
    item.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    return _run(item)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowDefinition, workflow_id)
    if item is None:
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    return _workflow(item)


@router.put("/{workflow_id}/state")
def set_state(workflow_id: str, data: StateInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(WorkflowDefinition, workflow_id)
    if item is None:
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    item.state = data.state
    db.commit()
    return _workflow(item)


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    item = db.get(WorkflowDefinition, workflow_id)
    if item is not None:
        db.execute(delete(WorkflowRunRecord).where(WorkflowRunRecord.workflow_id == workflow_id))
        db.delete(item)
        db.commit()
    return Response(status_code=204)
