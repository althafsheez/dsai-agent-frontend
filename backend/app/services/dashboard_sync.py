"""Keeps dashboards fed from Google Drive current without anyone opening them.

Every `dashboard_sync_seconds` the server looks at dashboards that have automatic refresh on, re-downloads the Drive files they use
when those are due, and rebuilds the dashboards' listing previews if a file actually changed.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import Settings
from ..errors import APIError
from ..models import Dashboard, Resource
from . import google_drive as drive
from .dashboard_preview import compute_preview
from .dataset_preview import inspect_dataset
from .resource_uploads import store_file_object

log = logging.getLogger(__name__)


def is_drive_dataset(resource: Resource | None) -> bool:
    metadata = (resource.metadata_json or {}) if resource else {}
    return bool(resource and resource.resource_type == "dataset" and metadata.get("source_connector") == drive.PROVIDER and metadata.get("drive_file_id"))


async def sync_resource(session: Session, settings: Settings, client: httpx.AsyncClient, storage: Any, resource: Resource) -> str:
    """Re-download one Drive dataset with its owner's connection. The resource id stays, so dashboards show the new data."""
    metadata = dict(resource.metadata_json or {})
    connection = drive.require_connection(session, resource.created_by)
    token = await drive.access_token(session, settings, client, connection)
    filename, content_type, content, extra = await drive.download_file(client, token, metadata["drive_file_id"])
    file_object = store_file_object(session, storage, filename, content_type, content)
    changed = file_object.id != resource.file_object_id
    if changed:
        resource.file_object_id = file_object.id
        metadata = {**metadata, "size_bytes": len(content), **inspect_dataset(filename, content), **extra}
    metadata.pop("sync_error", None)
    resource.metadata_json = {**metadata, "refreshed_at": datetime.now(timezone.utc).isoformat()}
    session.commit()
    return "updated" if changed else "unchanged"


def _due(resource: Resource, minutes: int, now: datetime) -> bool:
    stamp = (resource.metadata_json or {}).get("refreshed_at")
    if not stamp:
        return True
    try:
        last = datetime.fromisoformat(stamp)
    except ValueError:
        return True
    return now - (last if last.tzinfo else last.replace(tzinfo=timezone.utc)) >= timedelta(minutes=minutes)


def refresh_previews(session: Session, storage: Any, dataset_id: str) -> int:
    """Rebuild the card of every dashboard that uses the dataset, without counting it as an edit."""
    count = 0
    for item in session.scalars(select(Dashboard)):
        if dataset_id in (item.dataset_ids or []):
            session.execute(update(Dashboard).where(Dashboard.id == item.id).values(preview=compute_preview(session, storage, item.widgets), updated_at=Dashboard.updated_at))
            count += 1
    session.commit()
    return count


async def sync_due(app: Any) -> dict[str, str]:
    """One pass. Returns {dataset name: updated|unchanged|error} for what was checked."""
    settings, client, storage = app.state.settings, app.state.connector_http, app.state.storage
    now = datetime.now(timezone.utc)
    report: dict[str, str] = {}
    with app.state.session_factory() as session:
        wanted: dict[str, int] = {}
        for item in session.scalars(select(Dashboard).where(Dashboard.refresh_minutes > 0)):
            for dataset_id in item.dataset_ids or []:
                wanted[dataset_id] = min(wanted.get(dataset_id, item.refresh_minutes), item.refresh_minutes)
        for dataset_id, minutes in wanted.items():
            resource = session.get(Resource, dataset_id)
            if not is_drive_dataset(resource) or not _due(resource, minutes, now):
                continue
            try:
                outcome = await sync_resource(session, settings, client, storage, resource)
                if outcome == "updated":
                    refresh_previews(session, storage, dataset_id)
                report[resource.name] = outcome
            except (APIError, httpx.HTTPError) as exc:
                session.rollback()
                message = exc.message if isinstance(exc, APIError) else "Google Drive could not be reached."
                resource.metadata_json = {**(resource.metadata_json or {}), "sync_error": message, "refreshed_at": now.isoformat()}
                session.commit()
                report[resource.name] = "error"
                log.warning("Drive sync failed for %s: %s", resource.name, message)
    return report


async def sync_loop(app: Any, every: int) -> None:
    while True:
        await asyncio.sleep(every)
        try:
            await sync_due(app)
        except Exception:  # keep the loop alive whatever one pass hit
            log.exception("Dashboard Drive sync pass failed")
