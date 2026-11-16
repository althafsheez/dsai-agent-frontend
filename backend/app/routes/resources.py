from __future__ import annotations

import mimetypes
import hashlib
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..errors import APIError
from ..models import FileObject, LibraryEntry, Message, Resource, ResourceLink, User
from ..services.records import require_chat, require_workspace
from ..services.dataset_preview import MAX_PREVIEW_ROWS, inspect_dataset
from ..storage import LocalFileStorage
router = APIRouter(prefix="/api/resources", tags=["resources"])
catalog_router = APIRouter(prefix="/api", tags=["resources"])
DATASET_EXTENSIONS = {".csv", ".parquet", ".xlsx", ".xls"}
CODE_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx", ".sql", ".html", ".css", ".yaml", ".yml", ".sh", ".r"}
ALLOWED_EXTENSIONS = DATASET_EXTENSIONS | CODE_EXTENSIONS | {".png", ".jpg", ".jpeg", ".pdf", ".txt", ".md", ".json"}


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
    else:
        raise APIError(422, "invalid_scope", "Resource scope must be chat or workspace.")
    existing = session.scalar(select(ResourceLink).where(
        ResourceLink.scope_type == scope_type,
        ResourceLink.scope_id == scope_id,
        ResourceLink.client_upload_id == client_upload_id,
    ))
    if existing is not None:
        resource = session.get(Resource, existing.resource_id)
        if resource is not None:
            return {"resource": _summary(resource), "link_id": existing.id}
    filename = Path(file.filename or "upload.bin").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise APIError(415, "unsupported_file", "This file type is not supported.")
    content = await file.read(25 * 1024 * 1024 + 1)
    if len(content) > 25 * 1024 * 1024:
        raise APIError(413, "file_too_large", "Files are limited to 25 MB.")
    storage: LocalFileStorage = request.app.state.storage
    digest = hashlib.sha256(content).hexdigest()
    file_object = session.scalar(select(FileObject).where(FileObject.content_hash == digest))
    if file_object is None:
        stored = storage.store_bytes(content)
        file_object = FileObject(
            content_hash=stored.content_hash,
            relative_storage_path=stored.relative_path,
            mime_type=file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
            size_bytes=stored.size_bytes,
        )
        session.add(file_object)
        session.flush()
    resource = Resource(
        resource_type="dataset" if extension in DATASET_EXTENSIONS else "artifact",
        file_object_id=file_object.id,
        name=filename,
        origin="uploaded",
        source="input",
        created_by=user.id,
        metadata_json={"size_bytes": len(content), **inspect_dataset(filename, content)},
    )
    session.add(resource)
    session.flush()
    link = ResourceLink(
        resource_id=resource.id,
        scope_type=scope_type,
        scope_id=scope_id,
        message_id=message_id,
        client_upload_id=client_upload_id,
    )
    session.add(link)
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
    scope_filters = [(ResourceLink.scope_type == "chat") & (ResourceLink.scope_id == chat.id)]
    if chat.workspace_id is not None:
        scope_filters.append(
            (ResourceLink.scope_type == "workspace") & (ResourceLink.scope_id == chat.workspace_id)
        )
    from sqlalchemy import or_

    rows = list(session.execute(
        select(Resource, FileObject, ResourceLink.scope_type)
        .join(ResourceLink, ResourceLink.resource_id == Resource.id)
        .join(FileObject, FileObject.id == Resource.file_object_id)
        .where(or_(*scope_filters))
        .order_by(Resource.created_at.desc(), Resource.id.desc())
    ).all())
    # A resource may be linked directly to the chat and to its workspace. It
    # is one effective input, so prefer the direct chat link and emit it once.
    seen: set[str] = set()
    return [row for row in sorted(rows, key=lambda row: row[2] != "chat") if not (row[0].id in seen or seen.add(row[0].id))]


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
        rows = session.execute(
            select(Resource, FileObject, ResourceLink.scope_type)
            .join(ResourceLink, ResourceLink.resource_id == Resource.id)
            .join(FileObject, FileObject.id == Resource.file_object_id)
            .where(ResourceLink.scope_type == "workspace", ResourceLink.scope_id == workspace_id)
            .order_by(Resource.created_at.desc(), Resource.id.desc())
        ).all()
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
    items = []
    for entry, resource, file_object in rows:
        item = _catalog_item(resource, file_object, "library", True)
        items.append({
            **item,
            "resource_type": resource.resource_type,
            "library_category": _library_category(resource),
            "library_created_at": entry.created_at,
        })
    return {"items": items, "next_cursor": None}


@router.post("/{resource_id}/library", status_code=status.HTTP_201_CREATED)
async def add_resource_to_library(
    resource_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _accessible_resource(session, user, resource_id)
    entry = session.scalar(select(LibraryEntry).where(
        LibraryEntry.user_id == user.id,
        LibraryEntry.resource_id == resource_id,
    ))
    if entry is None:
        entry = LibraryEntry(user_id=user.id, resource_id=resource_id)
        session.add(entry)
        session.commit()
        session.refresh(entry)
    return {"resource_id": resource_id, "in_library": True, "library_entry_id": entry.id}


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
async def preview_resource(
    resource_id: str,
    request: Request,
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
    if extension in CODE_EXTENSIONS | {".txt", ".md", ".json"}:
        content = content[:1_000_000]
    return Response(content=content, media_type=file_object.mime_type)
