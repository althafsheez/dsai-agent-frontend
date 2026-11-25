from __future__ import annotations

import re
import subprocess
from tempfile import TemporaryFile
from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import Chat, FileObject, LibraryEntry, Message, Resource, ResourceLink, User, Workspace
from ..services.records import require_chat, require_workspace
from ..services.dataset_preview import MAX_DASHBOARD_ROWS, MAX_PREVIEW_ROWS, read_csv_rows
from ..services.resource_uploads import CODE_EXTENSIONS, read_upload, register_upload, save_owned_resource_to_library
from ..storage import LocalFileStorage
router = APIRouter(prefix="/api/resources", tags=["resources"])
catalog_router = APIRouter(prefix="/api", tags=["resources"])


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_resource(
    request: Request,
    file: UploadFile = File(...),
    scope_type: str = Form(...),
    scope_id: str = Form(...),
    client_upload_id: str = Form(...),
    message_id: str | None = Form(default=None),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if scope_type == "chat":
        require_chat(session, user, scope_id)
        if message_id is not None:
            message = session.get(Message, message_id)
            if message is None or message.chat_id != scope_id:
                raise APIError(422, "invalid_message", "Upload message does not belong to this chat.")
    elif scope_type == "workspace":
        require_workspace(session, user, scope_id)
        if message_id is not None:
            raise APIError(422, "invalid_message", "Workspace uploads cannot reference a chat message.")
    elif scope_type == "library":
        # Stand-alone file saved straight to the user's Library, not part of any chat or workspace.
        scope_id = user.id
    else:
        raise APIError(422, "invalid_scope", "Resource scope must be chat, workspace or library.")
    existing = session.scalar(select(ResourceLink).where(
        ResourceLink.scope_type == scope_type,
        ResourceLink.scope_id == scope_id,
        ResourceLink.client_upload_id == client_upload_id,
    ))
    if existing is not None:
        resource = session.get(Resource, existing.resource_id)
        if resource is not None:
            return {"resource": _summary(resource), "link_id": existing.id}
    resource, link = register_upload(
        session, request.app.state.storage, await read_upload(file),
        user_id=user.id, scope_type=scope_type, scope_id=scope_id, message_id=message_id,
        client_upload_id=client_upload_id,
    )
    if scope_type == "library":
        session.add(LibraryEntry(user_id=user.id, resource_id=resource.id))
    session.commit()
    session.refresh(resource)
    return {"resource": _summary(resource), "link_id": link.id}


def _summary(resource: Resource) -> dict:
    return {
        "id": resource.id,
        "resource_type": resource.resource_type,
        "name": resource.name,
        "origin": resource.origin,
        "size_bytes": int(resource.metadata_json.get("size_bytes", 0)),
    }


def _artifact_kind(name: str) -> str:
    extension = Path(name).suffix.lower()
    if extension in {".png", ".jpg", ".jpeg"}:
        return "image"
    if extension == ".pdf":
        return "pdf"
    if extension in {".md", ".txt"}:
        return "document"
    if extension == ".json" or extension in CODE_EXTENSIONS:
        return "code"
    return "file"


def _library_category(resource: Resource) -> str:
    """Use one stable category vocabulary for Library filtering clients."""
    if resource.resource_type == "dataset":
        return "dataset"
    kind = _artifact_kind(resource.name)
    if kind in {"image", "chart"}:
        return "visual"
    if kind == "code":
        return "code"
    if kind in {"pdf", "document"}:
        return "report"
    return "other"


def _catalog_item(
    resource: Resource,
    file_object: FileObject,
    scope_type: str,
    in_library: bool = False,
) -> dict:
    base = {
        "id": resource.id,
        "name": resource.name,
        "mime_type": file_object.mime_type,
        "size_bytes": file_object.size_bytes,
        "origin": resource.origin,
        "source": resource.source,
        "preview_url": f"/api/resources/{resource.id}/preview",
        "download_url": f"/api/resources/{resource.id}/download",
        "created_by": resource.created_by,
        "created_at": resource.created_at,
        "run_id": resource.run_id,
    }
    if resource.resource_type == "dataset":
        return {
            **base,
            "row_count": resource.metadata_json.get("row_count"),
            "column_count": resource.metadata_json.get("column_count"),
            "columns": resource.metadata_json.get("columns", []),
            "preview_rows": resource.metadata_json.get("preview_rows", []),
            "scope_type": scope_type,
            "in_library": in_library,
        }
    return {**base, "kind": _artifact_kind(resource.name), "in_library": in_library}


def _chat_catalog(session: Session, user: User, chat_id: str) -> list[tuple[Resource, FileObject, str]]:
    chat = require_chat(session, user, chat_id)
    scope_filters = [
        (ResourceLink.scope_type == "chat") & (ResourceLink.scope_id == chat.id),
        (ResourceLink.scope_type == "message") & (Message.chat_id == chat.id),
    ]
    if chat.workspace_id is not None:
        scope_filters.append(
            (ResourceLink.scope_type == "workspace") & (ResourceLink.scope_id == chat.workspace_id)
        )
    rows = list(session.execute(
        select(Resource, FileObject, case((ResourceLink.scope_type == "message", "chat"), else_=ResourceLink.scope_type))
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .outerjoin(Message, Message.id == ResourceLink.message_id)
        .where(or_(*scope_filters))
        .order_by(Resource.created_at.desc(), Resource.id.desc())
    ).all())
    # A resource may be linked directly to the chat and to its workspace. It
    # is one effective input, so prefer the direct chat link and emit it once.
    seen: set[str] = set()
    return [row for row in sorted(rows, key=lambda row: row[2] != "chat") if not (row[0].id in seen or seen.add(row[0].id))]


def _workspace_datasets(session: Session, workspace_id: str):
    return session.execute(
        select(Resource, FileObject, ResourceLink.scope_type)
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .where(ResourceLink.scope_type == "workspace", ResourceLink.scope_id == workspace_id,
               Resource.resource_type == "dataset")
        .order_by(Resource.created_at.desc(), Resource.id.desc())
    ).unique().all()


@catalog_router.get("/workspaces/{workspace_id}/datasets/download")
def download_workspace_datasets(
    workspace_id: str,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    workspace = require_workspace(session, user, workspace_id)
    rows = _workspace_datasets(session, workspace_id)
    if not rows:
        raise APIError(404, "no_datasets", "This workspace has no datasets.")
    return _zip_datasets(request, [(resource, file_object) for resource, file_object, _ in rows], f"{workspace.name}-datasets.zip")


@catalog_router.get("/library/datasets/download")
def download_library_datasets(
    request: Request,
    workspace_id: str | None = None,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Zip the signed-in user's saved Library datasets, optionally only those in one workspace folder."""
    rows = session.execute(
        select(Resource, FileObject)
        .join(LibraryEntry, LibraryEntry.resource_id == Resource.id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .where(LibraryEntry.user_id == user.id, Resource.created_by == user.id, Resource.resource_type == "dataset")
        .order_by(LibraryEntry.created_at.desc(), LibraryEntry.id.desc())
    ).all()
    label = "library"
    if workspace_id:
        workspace = require_workspace(session, user, workspace_id)
        in_workspace = _library_workspaces(session, user, [resource.id for resource, _ in rows])
        rows = [(resource, file_object) for resource, file_object in rows if in_workspace.get(resource.id) and in_workspace[resource.id].id == workspace_id]
        label = workspace.name
    if not rows:
        raise APIError(404, "no_datasets", "There are no saved datasets to download.")
    return _zip_datasets(request, list(rows), f"{label}-datasets.zip")


def _zip_datasets(request: Request, rows: list[tuple[Resource, FileObject]], archive_name: str) -> Response:
    storage: LocalFileStorage = request.app.state.storage
    used_names: set[str] = set()
    archive = TemporaryFile()
    try:
        with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=1) as bundle:
            for resource, file_object in rows:
                original = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", resource.name).strip(" .") or "dataset"
                path = Path(original)
                name = original
                number = 2
                while name.casefold() in used_names:
                    name = f"{path.stem} ({number}){path.suffix}"
                    number += 1
                used_names.add(name.casefold())
                bundle.writestr(name, storage.read_bytes(file_object.relative_storage_path))
        archive.seek(0)
        filename = quote(archive_name, safe="")
        return StreamingResponse(
            iter(lambda: archive.read(65536), b""), media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
            background=BackgroundTask(archive.close),
        )
    except Exception:
        archive.close()
        raise


@catalog_router.get("/datasets")
async def list_datasets(
    chat_id: str | None = None,
    workspace_id: str | None = None,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if bool(chat_id) == bool(workspace_id):
        raise APIError(422, "invalid_scope", "Provide exactly one chat_id or workspace_id.")
    library_ids = set(session.scalars(select(LibraryEntry.resource_id).where(LibraryEntry.user_id == user.id)))
    if workspace_id:
        require_workspace(session, user, workspace_id)
        rows = _workspace_datasets(session, workspace_id)
    else:
        rows = _chat_catalog(session, user, chat_id or "")
    items = [
        _catalog_item(resource, file_object, scope_type, resource.id in library_ids)
        for resource, file_object, scope_type in rows
        if resource.resource_type == "dataset"
    ]
    return {"items": items, "next_cursor": None}


@catalog_router.get("/artifacts")
async def list_artifacts(
    chat_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    library_ids = set(session.scalars(select(LibraryEntry.resource_id).where(LibraryEntry.user_id == user.id)))
    items = [
        _catalog_item(resource, file_object, scope_type, resource.id in library_ids)
        for resource, file_object, scope_type in _chat_catalog(session, user, chat_id)
        if resource.resource_type == "artifact"
    ]
    return {"items": items, "next_cursor": None}


@catalog_router.get("/library")
async def list_library(
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rows = session.execute(
        select(LibraryEntry, Resource, FileObject)
        .join(Resource, Resource.id == LibraryEntry.resource_id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .where(LibraryEntry.user_id == user.id, Resource.created_by == user.id)
        .order_by(LibraryEntry.created_at.desc(), LibraryEntry.id.desc())
    ).all()
    workspaces = _library_workspaces(session, user, [resource.id for _, resource, _ in rows])
    library_ids = {resource.id for _, resource, _ in rows}
    direct = set(session.scalars(
        select(ResourceLink.resource_id).where(ResourceLink.resource_id.in_(library_ids), ResourceLink.scope_type == "library")
    )) if library_ids else set()
    items = []
    for entry, resource, file_object in rows:
        item = _catalog_item(resource, file_object, "library", True)
        workspace = workspaces.get(resource.id)
        items.append({
            **item,
            "resource_type": resource.resource_type,
            "library_category": _library_category(resource),
            "uploaded_in_library": resource.id in direct,
            "library_created_at": entry.created_at,
            "workspace_id": workspace.id if workspace else None,
            "workspace_name": workspace.name if workspace else None,
        })
    return {"items": items, "next_cursor": None}


def _library_workspaces(session: Session, user: User, resource_ids: list[str]) -> dict[str, Workspace]:
    """Map each saved resource to the live workspace it belongs to, directly or through a workspace chat."""
    if not resource_ids:
        return {}
    links = session.execute(
        select(ResourceLink.resource_id, ResourceLink.scope_type, ResourceLink.scope_id)
        .where(ResourceLink.resource_id.in_(resource_ids), ResourceLink.scope_type.in_(("workspace", "chat")))
        .order_by(ResourceLink.created_at)
    ).all()
    chat_ids = {scope_id for _, scope_type, scope_id in links if scope_type == "chat"}
    chat_workspace = dict(session.execute(
        select(Chat.id, Chat.workspace_id).where(Chat.id.in_(chat_ids), Chat.workspace_id.is_not(None))
    ).all()) if chat_ids else {}
    workspace_ids = {scope_id for _, scope_type, scope_id in links if scope_type == "workspace"} | set(chat_workspace.values())
    live = {
        workspace.id: workspace
        for workspace in session.scalars(select(Workspace).where(
            Workspace.id.in_(workspace_ids), Workspace.created_by == user.id, Workspace.deleted_at.is_(None),
        ))
    } if workspace_ids else {}
    result: dict[str, Workspace] = {}
    # A direct workspace link wins over one inherited from a chat.
    for resource_id, scope_type, scope_id in sorted(links, key=lambda link: link[1] != "workspace"):
        workspace_id = scope_id if scope_type == "workspace" else chat_workspace.get(scope_id)
        if resource_id not in result and workspace_id in live:
            result[resource_id] = live[workspace_id]
    return result


@router.post("/{resource_id}/library", status_code=status.HTTP_201_CREATED)
async def add_resource_to_library(
    resource_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _accessible_resource(session, user, resource_id)
    entry_id = save_owned_resource_to_library(session, user.id, resource_id).id
    session.commit()
    return {"resource_id": resource_id, "in_library": True, "library_entry_id": entry_id}


@router.delete("/{resource_id}/library", status_code=status.HTTP_204_NO_CONTENT)
async def remove_resource_from_library(
    resource_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _accessible_resource(session, user, resource_id)
    entry = session.scalar(select(LibraryEntry).where(
        LibraryEntry.user_id == user.id,
        LibraryEntry.resource_id == resource_id,
    ))
    if entry is not None:
        session.delete(entry)
        session.commit()


@catalog_router.get("/datasets/{resource_id}/preview")
async def preview_dataset(
    resource_id: str,
    limit: int = Query(default=50, ge=1, le=MAX_PREVIEW_ROWS),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    resource, _ = _accessible_resource(session, user, resource_id)
    if resource.resource_type != "dataset":
        raise APIError(404, "dataset_not_found", "Dataset not found.")
    metadata = resource.metadata_json
    rows = metadata.get("preview_rows", [])
    return {
        "name": resource.name,
        "total_rows": metadata.get("row_count"),
        "column_count": metadata.get("column_count"),
        "columns": metadata.get("columns", []),
        "rows": rows[:limit],
        "truncated": metadata.get("row_count") is None or len(rows) < (metadata.get("row_count") or 0),
    }


@catalog_router.get("/datasets/{resource_id}/rows")
async def dataset_rows(
    resource_id: str,
    request: Request,
    limit: int = Query(default=MAX_DASHBOARD_ROWS, ge=1, le=MAX_DASHBOARD_ROWS),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Up to 6,000 rows of a CSV dataset, for dashboard charts and filters."""
    from ..services.google_drive import PROVIDER as drive_provider
    from .dashboards import can_view_dataset  # a dashboard shared with the user makes its datasets readable

    row = session.execute(
        select(Resource, FileObject).join(FileObject, FileObject.id == Resource.file_object_id).where(Resource.id == resource_id)
    ).one_or_none()
    if row is None or (row[0].created_by != user.id and not can_view_dataset(session, user, resource_id)):
        raise APIError(404, "resource_not_found", "Resource not found.")
    resource, file_object = row
    if resource.resource_type != "dataset":
        raise APIError(404, "dataset_not_found", "Dataset not found.")
    storage: LocalFileStorage = request.app.state.storage
    data = read_csv_rows(resource.name, storage.read_bytes(file_object.relative_storage_path), limit)
    if data is None:
        raise APIError(422, "rows_unavailable", "Rows can only be read from CSV or XLSX datasets.")
    metadata = resource.metadata_json or {}
    return {
        "name": resource.name, **data,
        "refreshed_at": metadata.get("refreshed_at") or resource.created_at.isoformat(),
        "version": file_object.content_hash[:12],
        "syncable": metadata.get("source_connector") == drive_provider and resource.created_by == user.id and bool(metadata.get("drive_file_id")),
    }


def _accessible_resource(session: Session, user: User, resource_id: str) -> tuple[Resource, FileObject]:
    row = session.execute(
        select(Resource, FileObject)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .where(Resource.id == resource_id, Resource.created_by == user.id)
    ).one_or_none()
    if row is None:
        raise APIError(404, "resource_not_found", "Resource not found.")
    return row


@router.get("/{resource_id}/download")
async def download_resource(
    resource_id: str,
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    resource, file_object = _accessible_resource(session, user, resource_id)
    storage: LocalFileStorage = request.app.state.storage
    content = storage.read_bytes(file_object.relative_storage_path)
    return Response(
        content=content,
        media_type=file_object.mime_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(resource.name)}"},
    )


@router.get("/{resource_id}/preview")
def preview_resource(
    resource_id: str,
    request: Request,
    thumbnail: bool = False,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    resource, file_object = _accessible_resource(session, user, resource_id)
    extension = Path(resource.name).suffix.lower()
    previewable = file_object.mime_type in {"image/png", "image/jpeg", "application/pdf"} or extension in CODE_EXTENSIONS | {".txt", ".md", ".json"}
    if resource.resource_type == "dataset" or not previewable:
        raise APIError(415, "preview_unavailable", "A browser preview is not available for this file.")
    storage: LocalFileStorage = request.app.state.storage
    content = storage.read_bytes(file_object.relative_storage_path)
    if thumbnail:
        if file_object.mime_type != "application/pdf":
            raise APIError(415, "preview_unavailable", "Page thumbnails require a PDF.")
        try:
            page = subprocess.run(
                ["pdftocairo", "-png", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "640", "-", "-"],
                input=content, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=True,
            )
        except (OSError, subprocess.SubprocessError):
            raise APIError(422, "preview_unavailable", "PDF thumbnail unavailable.")
        return Response(content=page.stdout, media_type="image/png")
    if extension in CODE_EXTENSIONS | {".txt", ".md", ".json"}:
        content = content[:1_000_000]
    return Response(content=content, media_type=file_object.mime_type)
