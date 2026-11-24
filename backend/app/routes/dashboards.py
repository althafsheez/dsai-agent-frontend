from __future__ import annotations

from datetime import timezone
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from agentic.runtime.contracts import ProviderError

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import Dashboard, FileObject, Resource, User
from ..services import dashboard_ai
from ..services import dataset_relations
from ..services.dashboard_preview import compute_preview
from ..services.dashboard_script import ScriptError, run_script
from ..services.dataset_preview import read_csv_rows

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
    context: str = Field(default="", max_length=3000)


class TuneRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=2000)
    widgets: list[dict[str, Any]] = Field(max_length=40)
    slicers: list[str] = Field(default_factory=list, max_length=12)
    name: str = Field(default="", max_length=160)
    datasets: list[DatasetBrief] = Field(min_length=1, max_length=8)
    model_id: str
    effort: str | None = None
    context: str = Field(default="", max_length=3000)


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


def _loader(request: Request, db: Session, user: User):
    """Reads a dataset's full rows for a script. Only datasets the user owns or can see through a dashboard."""
    def load(dataset_id: str) -> dict | None:
        row = db.execute(select(Resource, FileObject).join(FileObject, FileObject.id == Resource.file_object_id).where(Resource.id == dataset_id)).one_or_none()
        if row is None or (row[0].created_by != user.id and not can_view_dataset(db, user, dataset_id)):
            return None
        try:
            rows = read_csv_rows(row[0].name, request.app.state.storage.read_bytes(row[1].relative_storage_path))
        except OSError:
            return None
        return None if rows is None else {"id": dataset_id, "name": row[0].name, "columns": [column["name"] for column in rows["columns"]], "rows": rows["rows"]}

    return load


async def _with_scripts(result: dict, data, request: Request, db: Session, user: User) -> dict:
    """Widgets the AI marked custom get a Python script written (and test-run on the real rows) before they are returned."""
    notes = list(result.get("notes", []))
    result["widgets"] = await dashboard_ai.fill_custom(request.app.state.provider, result["widgets"], _loader(request, db, user), data.model_id, data.effort, notes)
    result["notes"] = notes
    if not result["widgets"]:
        raise APIError(502, "dashboard_ai_failed", "None of the widgets could be built. Try rephrasing the request.")
    return result


@router.post("/generate")
async def generate_dashboard(data: GenerateRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    _validated(request, data.model_id, data.effort)
    datasets = [item.model_dump() for item in data.datasets]
    result = await dashboard_ai.generate(request.app.state.provider, data.prompt.strip(), datasets, data.model_id, data.effort, data.context)
    if not result["ok"]:
        raise APIError(502, "dashboard_ai_failed", result["error"])
    return await _with_scripts(result, data, request, db, user)


@router.post("/tune")
async def tune_dashboard(data: TuneRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Change an existing dashboard from a plain-language instruction (layout, charts, filters, titles, anything)."""
    _validated(request, data.model_id, data.effort)
    datasets = [item.model_dump() for item in data.datasets]
    result = await dashboard_ai.tune(request.app.state.provider, data.instruction.strip(), data.widgets, data.slicers, data.name, datasets, data.model_id, data.effort, data.context)
    if not result["ok"]:
        raise APIError(502, "dashboard_ai_failed", result["error"])
    return await _with_scripts(result, data, request, db, user)


class CustomRequest(BaseModel):
    request: str = Field(min_length=3, max_length=1000)
    title: str = Field(default="", max_length=80)
    dataset_ids: list[str] = Field(min_length=1, max_length=8)
    model_id: str
    effort: str | None = None


@router.post("/custom")
async def build_custom_chart(data: CustomRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """A chart no preset covers: the AI writes a Python script for it, it is run on the real rows, and the working script comes back."""
    _validated(request, data.model_id, data.effort)
    load = _loader(request, db, user)
    loaded = [item for item in (load(dataset_id) for dataset_id in data.dataset_ids) if item]
    if not loaded:
        raise APIError(404, "dataset_not_found", "None of those datasets could be read.")
    try:
        script, result = await dashboard_ai.write_script(request.app.state.provider, data.request.strip(), data.title or data.request[:60], loaded, data.model_id, data.effort)
    except ScriptError as exc:
        raise APIError(502, "dashboard_script_failed", str(exc)) from exc
    widget = {"id": f"w-py-{abs(hash(script)) % 10**8}", "type": "custom", "title": data.title or result.get("title") or data.request[:60], "dataset_id": loaded[0]["id"],
              "datasets": [item["id"] for item in loaded], "x": None, "y": None, "agg": "count", "span": 2, "script": script, "request": data.request.strip()}
    return {"widget": widget, "result": result}


class RunRequest(BaseModel):
    script: str = Field(max_length=7000)
    dataset_ids: list[str] = Field(min_length=1, max_length=8)


run_router = APIRouter(prefix="/api/dashboards/custom", tags=["dashboards"])


@run_router.post("/run")
def run_custom_chart(data: RunRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Runs a saved chart script on the current rows."""
    load = _loader(request, db, user)
    loaded = [item for item in (load(dataset_id) for dataset_id in data.dataset_ids) if item]
    if not loaded:
        raise APIError(404, "dataset_not_found", "None of those datasets could be read.")
    try:
        return {"result": run_script(data.script, loaded)}
    except ScriptError as exc:
        raise APIError(422, "dashboard_script_failed", str(exc)) from exc


class AnalyzeRequest(BaseModel):
    dataset_ids: list[str] = Field(min_length=2, max_length=8)


@router.post("/analyze")
def analyze_datasets(data: AnalyzeRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """How the chosen datasets overlap, and where two files disagree about the same quantity."""
    load = _loader(request, db, user)
    loaded = [item for item in (load(dataset_id) for dataset_id in data.dataset_ids) if item]
    return dataset_relations.analyze(loaded)


@router.post("/review")
async def review_dashboard(data: ReviewRequest, request: Request, user: User = Depends(get_current_user)) -> dict:
    _validated(request, data.model_id, data.effort)
    datasets = [item.model_dump() for item in data.datasets]
    return await dashboard_ai.review(request.app.state.provider, data.widgets, datasets, data.model_id, data.effort)


REFRESH_CHOICES = (0, 1, 5, 15, 60)


class ShareInput(BaseModel):
    user_id: str = Field(max_length=64)
    role: str = Field(pattern="^(viewer|editor)$")


class DashboardInput(BaseModel):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(max_length=160)
    description: str = Field(default="", max_length=2000)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    pinned: bool | None = None
    slicers: list[str] = Field(default_factory=list, max_length=12)
    dataset_ids: list[str] = Field(default_factory=list, max_length=20)
    widgets: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    shares: list[ShareInput] | None = Field(default=None, max_length=50)
    refresh_minutes: int | None = None


def role_of(item: Dashboard, user: User) -> str | None:
    """owner / editor / viewer, or None when the dashboard is not visible to this user.

    Published dashboards can be viewed by the whole team; drafts only by the owner and the people it is shared with.
    """
    if item.owner_id == user.id:
        return "owner"
    for share in item.shares or []:
        if share.get("user_id") == user.id:
            return share.get("role") if share.get("role") in ("viewer", "editor") else "viewer"
    return "viewer" if item.status == "published" else None


def _require(item: Dashboard | None, user: User) -> tuple[Dashboard, str]:
    role = role_of(item, user) if item is not None else None
    if item is None or role is None:
        raise APIError(404, "dashboard_not_found", "Dashboard not found.")
    return item, role


def _utc(moment) -> str:
    """SQLite returns naive datetimes; they are UTC, so say so, or browsers read them as local time."""
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).isoformat()


def _sources(db: Session, item: Dashboard) -> list[dict]:
    """The Google Drive files this dashboard is fed from, and when each was last checked, so the UI can say it stays current by itself."""
    found = []
    for dataset_id in item.dataset_ids or []:
        resource = db.get(Resource, dataset_id)
        metadata = (resource.metadata_json or {}) if resource else {}
        if resource is not None and metadata.get("source_connector") == "google-drive":
            found.append({"name": resource.name, "provider": "google-drive", "refreshed_at": metadata.get("refreshed_at"), "error": metadata.get("sync_error")})
    return found


def _view(item: Dashboard, user: User, db: Session, role: str) -> dict:
    owner = db.get(User, item.owner_id)
    mine = item.owner_id == user.id
    view = {
        "id": item.id, "name": item.name, "description": item.description, "status": item.status, "pinned": user.id in (item.pinned_by or []),
        "slicers": item.slicers, "dataset_ids": item.dataset_ids, "widgets": item.widgets, "preview": item.preview or {},
        "owner": "You" if mine else (owner.name if owner else "Unknown"), "ownership": "owned" if mine else "shared",
        "role": role, "refresh_minutes": item.refresh_minutes or 0, "sources": _sources(db, item),
        "created_at": _utc(item.created_at), "updated_at": _utc(item.updated_at),
    }
    if role == "owner":
        names = {person.id: person.name for person in db.scalars(select(User))}
        view["shares"] = [{"user_id": share["user_id"], "name": names.get(share["user_id"], "Unknown"), "role": share["role"]} for share in item.shares or []]
    return view


def can_view_dataset(db: Session, user: User, dataset_id: str) -> bool:
    """A dataset used by a dashboard the user can see is readable by them, even if someone else uploaded it."""
    for item in db.scalars(select(Dashboard).where(Dashboard.owner_id != user.id)):
        if dataset_id in (item.dataset_ids or []) and role_of(item, user) is not None:
            return True
    return False


@store_router.get("")
def list_dashboards(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    items = db.scalars(select(Dashboard).order_by(Dashboard.updated_at.desc())).all()
    return {"items": [_view(item, user, db, role) for item in items if (role := role_of(item, user))]}


@store_router.get("/people")
def list_people(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Teammates a dashboard can be shared with."""
    people = db.scalars(select(User).where(User.id != user.id).order_by(User.name)).all()
    return {"items": [{"id": person.id, "name": person.name, "initials": person.initials} for person in people]}


@store_router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    item, role = _require(db.get(Dashboard, dashboard_id), user)
    return _view(item, user, db, role)


@store_router.put("")
def save_dashboard(data: DashboardInput, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Create, or update when the id already exists. Owners and editors change content; only the owner changes sharing."""
    existing = db.get(Dashboard, data.id) if data.id else None
    if existing is None:
        item, role = Dashboard(owner_id=user.id), "owner"
        if data.id:
            item.id = data.id
        db.add(item)
    else:
        item, role = _require(existing, user)
        if role == "viewer":
            raise APIError(403, "dashboard_read_only", "You can view this dashboard but not change it.")
    item.name = data.name.strip() or "Untitled dashboard"
    item.description = data.description.strip()
    item.slicers = data.slicers
    item.dataset_ids = data.dataset_ids
    item.widgets = data.widgets
    if data.refresh_minutes is not None:
        if data.refresh_minutes not in REFRESH_CHOICES:
            raise APIError(422, "invalid_refresh", "Refresh must be off, or every 1, 5, 15 or 60 minutes.")
        item.refresh_minutes = data.refresh_minutes
    if role == "owner":
        item.status = data.status
        if data.shares is not None:
            known = set(db.scalars(select(User.id)))
            item.shares = [
                {"user_id": share.user_id, "role": share.role}
                for share in {share.user_id: share for share in data.shares}.values()
                if share.user_id in known and share.user_id != user.id
            ]
    if data.pinned is not None:
        item.pinned_by = _with_pin(item, user, data.pinned)
    item.preview = _preview(request, db, data.widgets)
    db.commit()
    return _view(item, user, db, role)


def _with_pin(item: Dashboard, user: User, pinned: bool) -> list[str]:
    others = [uid for uid in (item.pinned_by or []) if uid != user.id]
    return [*others, user.id] if pinned else others


def _preview(request: Request, db: Session, widgets: list[dict[str, Any]]) -> dict[str, Any]:
    return compute_preview(db, request.app.state.storage, widgets)


class PinInput(BaseModel):
    pinned: bool


@store_router.put("/{dashboard_id}/pin")
def pin_dashboard(dashboard_id: str, data: PinInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Pins are personal: anyone who can see a dashboard can pin it for themselves."""
    item, role = _require(db.get(Dashboard, dashboard_id), user)
    # A personal pin is not an edit, so "last updated" is set explicitly to what it was.
    db.execute(update(Dashboard).where(Dashboard.id == item.id).values(pinned_by=_with_pin(item, user, data.pinned), updated_at=Dashboard.updated_at))
    db.commit()
    db.refresh(item)
    return _view(item, user, db, role)


@store_router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    existing = db.get(Dashboard, dashboard_id)
    if existing is None:
        return Response(status_code=204)
    item, role = _require(existing, user)
    if role != "owner":
        raise APIError(403, "dashboard_owner_only", "Only the owner can delete a dashboard.")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
