from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from agentic.runtime.contracts import ProviderError

from ..dependencies import get_current_user
from ..errors import APIError
from ..models import User
from ..services import dashboard_ai

router = APIRouter(prefix="/api/dashboards/ai", tags=["dashboards"])


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
