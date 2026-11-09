from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text

from ..errors import APIError
from ..providers import ProviderError
from ..schemas import ModelMetadata, ModelsResponse


router = APIRouter(tags=["meta"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    with request.app.state.session_factory() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ready"}


@router.get("/api/health")
async def api_health(request: Request) -> dict[str, str]:
    return await health(request)


@router.get("/api/models", response_model=ModelsResponse)
async def models(request: Request) -> ModelsResponse:
    provider = request.app.state.provider
    try:
        discovered, status = await provider.list_models()
    except ProviderError as exc:
        raise APIError(503, exc.code, str(exc)) from exc
    default_model = getattr(provider, "default_model_id", None)
    if default_model not in {model.id for model in discovered}:
        default_model = discovered[0].id if discovered else None
    return ModelsResponse(
        default_model_id=default_model,
        models=[
            ModelMetadata(
                id=model.id,
                label=model.label,
                supported_efforts=list(model.supported_efforts),
                default_effort=model.default_effort,
            )
            for model in discovered
        ],
        configuration_status=status,
    )
