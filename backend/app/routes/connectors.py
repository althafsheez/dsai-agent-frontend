from __future__ import annotations

from urllib.parse import urlencode

import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import LibraryEntry, ResourceLink, Resource, User
from ..services import dashboard_sync, google_drive as drive
from ..services.records import require_chat, require_workspace
from ..services.dataset_preview import inspect_dataset
from ..services.resource_uploads import register_upload, store_file_object
from .resources import _summary

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


def _http(request: Request) -> httpx.AsyncClient:
    return request.app.state.connector_http


@router.get("")
def list_connectors(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    connection = drive.get_connection(session, user.id)
    configured = request.app.state.settings.google_drive_configured
    return {"items": [{
        "id": drive.PROVIDER,
        "status": "connected" if connection else ("disconnected" if configured else "unavailable"),
        "configured": configured,
        "account_email": connection.account_email if connection else None,
        "connected_at": connection.created_at if connection else None,
    }]}


@router.post("/google-drive/authorize")
def authorize(request: Request, user: User = Depends(get_current_user)) -> dict:
    return {"authorization_url": drive.authorization_url(request.app.state.settings, user.id)}


@router.get("/google-drive/callback", include_in_schema=False)
async def callback(
    request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
    session: Session = Depends(get_db),
) -> RedirectResponse:
    """Google redirects the browser here. The user is identified by the signed state, not a header."""
    settings = request.app.state.settings

    def back(**params: str) -> RedirectResponse:
        return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/connectors?{urlencode(params)}", status_code=303)

    if error or not code or not state:
        return back(error="access_denied" if error == "access_denied" else "connection_failed")
    try:
        user_id = drive.verify_state(settings, state)
        await drive.complete_authorization(session, settings, _http(request), user_id=user_id, code=code)
    except APIError as exc:
        return back(error=exc.code)
    return back(connected=drive.PROVIDER)


@router.delete("/google-drive", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    connection = drive.get_connection(session, user.id)
    if connection is not None:
        await drive.disconnect(session, request.app.state.settings, _http(request), connection)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google-drive/files")
async def list_drive_files(
    request: Request,
    folder_id: str | None = Query(default=None, max_length=200),
    q: str | None = Query(default=None, max_length=200),
    page_token: str | None = Query(default=None, max_length=2000),
    session: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> dict:
    settings = request.app.state.settings
    connection = drive.require_connection(session, user.id)
    token = await drive.access_token(session, settings, _http(request), connection)
    return await drive.list_files(_http(request), token, folder_id=folder_id, query=q or None, page_token=page_token)


class ImportRequest(BaseModel):
    file_ids: list[str] = Field(min_length=1, max_length=10)
    scope_type: str
    scope_id: str


@router.post("/google-drive/import")
async def import_drive_files(
    payload: ImportRequest, request: Request,
    session: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> dict:
    if payload.scope_type == "chat":
        require_chat(session, user, payload.scope_id)
    elif payload.scope_type == "workspace":
        require_workspace(session, user, payload.scope_id)
    elif payload.scope_type == "library":
        payload.scope_id = user.id
    else:
        raise APIError(422, "invalid_scope", "Resource scope must be chat, workspace or library.")
    settings = request.app.state.settings
    client = _http(request)
    connection = drive.require_connection(session, user.id)
    token = await drive.access_token(session, settings, client, connection)
    imported: list[dict] = []
    failed: list[dict] = []
    for file_id in dict.fromkeys(payload.file_ids):
        upload_id = f"gdrive:{file_id}"
        existing = session.scalar(select(ResourceLink).where(
            ResourceLink.scope_type == payload.scope_type, ResourceLink.scope_id == payload.scope_id,
            ResourceLink.client_upload_id == upload_id))
        existing_resource = session.get(Resource, existing.resource_id) if existing else None
        if existing_resource is not None:
            imported.append({"file_id": file_id, "resource": _summary(existing_resource), "already_imported": True})
            continue
        try:
            filename, content_type, content, extra = await drive.download_file(client, token, file_id)
            resource, _ = register_upload(
                session, request.app.state.storage, (filename, content_type, content),
                user_id=user.id, scope_type=payload.scope_type, scope_id=payload.scope_id,
                message_id=None, client_upload_id=upload_id,
            )
            resource.metadata_json = {**resource.metadata_json, "source_connector": drive.PROVIDER, **extra}
            if payload.scope_type == "library":
                session.add(LibraryEntry(user_id=user.id, resource_id=resource.id))
            session.commit()
            session.refresh(resource)
            imported.append({"file_id": file_id, "resource": _summary(resource), "already_imported": False})
        except APIError as exc:
            session.rollback()
            if exc.code == "connector_reauth_required":
                raise
            failed.append({"file_id": file_id, "code": exc.code, "message": exc.message})
    return {"imported": imported, "failed": failed}


sync_router = APIRouter(prefix="/api/datasets", tags=["connectors"])


@sync_router.post("/{resource_id}/sync")
async def sync_dataset_from_drive(
    resource_id: str, request: Request,
    session: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> dict:
    """Re-download a Google Drive dataset. The resource id stays the same, so dashboards built on it show the new data."""
    resource = session.scalar(select(Resource).where(Resource.id == resource_id, Resource.created_by == user.id))
    metadata = dict(resource.metadata_json or {}) if resource else {}
    if resource is None or resource.resource_type != "dataset" or metadata.get("source_connector") != drive.PROVIDER or not metadata.get("drive_file_id"):
        raise APIError(422, "not_syncable", "Only datasets imported from Google Drive can be re-synced.")
    outcome = await dashboard_sync.sync_resource(session, request.app.state.settings, _http(request), request.app.state.storage, resource)
    refresh = dashboard_sync.refresh_previews(session, request.app.state.storage, resource.id) if outcome == "updated" else 0
    return {"status": outcome, "refreshed_at": resource.metadata_json["refreshed_at"], "dashboards_updated": refresh}
