from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from agentic.runtime.contracts import ProviderError

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import Dashboard, User
from ..services import dashboard_ai

router = APIRouter(prefix="/api/dashboards/ai", tags=["dashboards"])
store_router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class ColumnBrief(BaseModel):
    name: str
    data_type: str = "string"


class DatasetBrief(BaseModel):
    id: str
    name: str
    columns: list[ColumnBrief] = Field(max_length=80)
    rows: list[list[Any]] = Field(default_factory=list, max_length=50)
    row_count: int | None = None


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    datasets: list[DatasetBrief] = Field(min_length=1, max_length=8)
    model_id: str
    effort: str | None = None


class ReviewRequest(BaseModel):
    widgets: list[dict[str, Any]] = Field(max_length=40)
    datasets: list[DatasetBrief] = Field(min_length=1, max_length=8)
    model_id: str
    effort: str | None = None


def _validated(request: Request, model_id: str, effort: str | None) -> None:
    try:
        request.app.state.provider.validate_selection(model_id, effort)
    except ProviderError as exc:
        raise APIError(422, exc.code, str(exc)) from exc


@router.post("/generate")
async def generate_dashboard(data: GenerateRequest, request: Request, user: User = Depends(get_current_user)) -> dict:
    _validated(request, data.model_id, data.effort)
    datasets = [item.model_dump() for item in data.datasets]
    result = await dashboard_ai.generate(request.app.state.provider, data.prompt.strip(), datasets, data.model_id, data.effort)
    if not result["ok"]:
        raise APIError(502, "dashboard_ai_failed", result["error"])
    return result


@router.post("/review")
async def review_dashboard(data: ReviewRequest, request: Request, user: User = Depends(get_current_user)) -> dict:
    _validated(request, data.model_id, data.effort)
    datasets = [item.model_dump() for item in data.datasets]
    return await dashboard_ai.review(request.app.state.provider, data.widgets, datasets, data.model_id, data.effort)


class DashboardInput(BaseModel):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(max_length=160)
    description: str = Field(default="", max_length=2000)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    pinned: bool = False
    slicers: list[str] = Field(default_factory=list, max_length=12)
    dataset_ids: list[str] = Field(default_factory=list, max_length=20)
    widgets: list[dict[str, Any]] = Field(default_factory=list, max_length=40)


def _view(item: Dashboard, user: User, db: Session) -> dict:
    owner = db.get(User, item.owner_id)
    mine = item.owner_id == user.id
    return {
        "id": item.id, "name": item.name, "description": item.description, "status": item.status, "pinned": item.pinned,
        "slicers": item.slicers, "dataset_ids": item.dataset_ids, "widgets": item.widgets,
        "owner": "You" if mine else (owner.name if owner else "Unknown"), "ownership": "owned" if mine else "shared",
        "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }


@store_router.get("")
def list_dashboards(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    items = db.scalars(select(Dashboard).order_by(Dashboard.updated_at.desc())).all()
    return {"items": [_view(item, user, db) for item in items]}


@store_router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item = db.get(Dashboard, dashboard_id)
    if item is None:
        raise APIError(404, "dashboard_not_found", "Dashboard not found.")
    return _view(item, user, db)


@store_router.put("")
def save_dashboard(data: DashboardInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Create, or update when the id already exists. Anyone on the team can edit shared dashboards."""
    item = db.get(Dashboard, data.id) if data.id else None
    if item is None:
        item = Dashboard(owner_id=user.id)
        if data.id:
            item.id = data.id
        db.add(item)
    item.name = data.name.strip() or "Untitled dashboard"
    item.description = data.description.strip()
    item.status = data.status
    item.pinned = data.pinned
    item.slicers = data.slicers
    item.dataset_ids = data.dataset_ids
    item.widgets = data.widgets
    db.commit()
    return _view(item, user, db)


@store_router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    item = db.get(Dashboard, dashboard_id)
    if item is not None:
        db.delete(item)
        db.commit()
    return Response(status_code=204)
