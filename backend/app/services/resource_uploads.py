from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import APIError
from ..models import FileObject, Resource, ResourceLink
from ..storage import LocalFileStorage
from .dataset_preview import inspect_dataset


DATASET_EXTENSIONS = {".csv", ".parquet", ".xlsx", ".xls"}
CODE_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx", ".sql", ".html", ".css", ".yaml", ".yml", ".sh", ".r"}
ALLOWED_EXTENSIONS = DATASET_EXTENSIONS | CODE_EXTENSIONS | {".png", ".jpg", ".jpeg", ".pdf", ".txt", ".md", ".json"}


async def read_upload(file: UploadFile) -> tuple[str, str | None, bytes]:
    filename = Path(file.filename or "upload.bin").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise APIError(415, "unsupported_file", "This file type is not supported.")
    content = await file.read(25 * 1024 * 1024 + 1)
    if len(content) > 25 * 1024 * 1024:
        raise APIError(413, "file_too_large", "Files are limited to 25 MB.")
    return filename, file.content_type, content


def store_file_object(session: Session, storage: LocalFileStorage, filename: str, content_type: str | None, content: bytes) -> FileObject:
    """The stored blob for these bytes: reused when identical content already exists."""
    digest = hashlib.sha256(content).hexdigest()
    file_object = session.scalar(select(FileObject).where(FileObject.content_hash == digest))
    if file_object is None:
        stored = storage.store_bytes(content)
        file_object = FileObject(
            content_hash=stored.content_hash,
            relative_storage_path=stored.relative_path,
            mime_type=content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
            size_bytes=stored.size_bytes,
        )
        session.add(file_object)
        session.flush()
    return file_object


def register_upload(
    session: Session, storage: LocalFileStorage, upload: tuple[str, str | None, bytes], *,
    user_id: str, scope_type: str, scope_id: str, message_id: str | None, client_upload_id: str | None,
) -> tuple[Resource, ResourceLink]:
    filename, content_type, content = upload
    extension = Path(filename).suffix.lower()
    file_object = store_file_object(session, storage, filename, content_type, content)
    resource = Resource(
        resource_type="dataset" if extension in DATASET_EXTENSIONS else "artifact",
        file_object_id=file_object.id,
        name=filename,
        origin="uploaded",
        source="input",
        created_by=user_id,
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
    return resource, link


def attach_library_resources(session: Session, user_id: str, message_id: str, resource_ids: list[str]) -> None:
    if not resource_ids:
        return
    # Files the user owns: saved to the Library, or imported straight into a chat (for example from Google Drive).
    available = set(session.scalars(
        select(Resource.id).where(Resource.id.in_(resource_ids), Resource.created_by == user_id)
    ))
    if set(resource_ids) != available:
        raise APIError(404, "resource_not_found", "A selected file is no longer available.")
    session.add_all(
        ResourceLink(resource_id=resource_id, scope_type="message", scope_id=message_id, message_id=message_id)
        for resource_id in dict.fromkeys(resource_ids)
    )
