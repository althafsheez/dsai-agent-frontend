"""Portable snapshot of app data so a git clone starts with the same history and files.

`shared-data/snapshot.json` holds every table row; `shared-data/files/` holds the stored blobs.
Secrets never leave the machine: connector tokens are excluded.

    python -m app.snapshot export   # write the local DB + storage into shared-data/
    python -m app.snapshot import   # load shared-data/ into an empty local DB
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Engine, func, insert, select
from sqlalchemy.orm import Session

from .config import BACKEND_ROOT, Settings, get_settings
from .db import Base, make_engine
from . import models  # noqa: F401  (register tables)

SHARED_DIR = BACKEND_ROOT.parent / "shared-data"
EXCLUDED_TABLES = {"connector_connections", "alembic_version"}
SNAPSHOT_VERSION = 1


def _tables():
    return [table for table in Base.metadata.sorted_tables if table.name not in EXCLUDED_TABLES]


def _encode(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _decode(table, row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for column in table.columns:
        if isinstance(column.type, DateTime) and isinstance(out.get(column.name), str):
            out[column.name] = datetime.fromisoformat(out[column.name])
    return out


def export_snapshot(engine: Engine, storage_root: Path, target: Path = SHARED_DIR) -> dict[str, int]:
    target.mkdir(parents=True, exist_ok=True)
    data: dict[str, list[dict[str, Any]]] = {}
    with Session(engine) as session:
        for table in _tables():
            order = [column for column in table.primary_key.columns]
            rows = session.execute(select(table).order_by(*order)).mappings().all()
            data[table.name] = [{key: _encode(value) for key, value in row.items()} for row in rows]

    files_dir = target / "files"
    wanted = {row["relative_storage_path"] for row in data.get("file_objects", [])}
    if files_dir.exists():
        shutil.rmtree(files_dir)
    copied = 0
    for relative in sorted(wanted):
        source = storage_root / relative
        if source.is_file():
            destination = files_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            copied += 1

    payload = {"version": SNAPSHOT_VERSION, "tables": data}
    (target / "snapshot.json").write_text(json.dumps(payload, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8")
    counts = {name: len(rows) for name, rows in data.items() if rows}
    counts["files"] = copied
    return counts


def is_fresh(engine: Engine) -> bool:
    """True when the database has no user content yet (only seeded demo users)."""
    with Session(engine) as session:
        for name in ("workspaces", "chats", "resources", "dashboards"):
            table = Base.metadata.tables.get(name)
            if table is not None and session.scalar(select(func.count()).select_from(table)):
                return False
    return True


def import_snapshot(engine: Engine, storage_root: Path, source: Path = SHARED_DIR) -> dict[str, int]:
    """Insert rows that are missing (by primary key) and copy blobs that are missing. Never overwrites."""
    snapshot = source / "snapshot.json"
    if not snapshot.is_file():
        return {}
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    with Session(engine) as session:
        for table in _tables():
            rows = payload.get("tables", {}).get(table.name, [])
            key = table.primary_key.columns.keys()
            added = 0
            for row in rows:
                condition = [table.c[name] == row[name] for name in key]
                if session.execute(select(func.count()).select_from(table).where(*condition)).scalar():
                    continue
                session.execute(insert(table).values(**_decode(table, row)))
                added += 1
            if added:
                counts[table.name] = added
        session.commit()

    files_dir = source / "files"
    copied = 0
    if files_dir.is_dir():
        for path in files_dir.rglob("*"):
            if path.is_file():
                destination = storage_root / path.relative_to(files_dir)
                if not destination.exists():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, destination)
                    copied += 1
    counts["files"] = copied
    return counts


def _engine_and_settings() -> tuple[Engine, Settings]:
    settings = get_settings()
    return make_engine(settings.database_url), settings


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in {"export", "import"}:
        print(__doc__)
        return 2
    engine, settings = _engine_and_settings()
    if argv[0] == "export":
        counts = export_snapshot(engine, settings.storage_root)
        print("Exported:", ", ".join(f"{name}={count}" for name, count in counts.items()))
    else:
        counts = import_snapshot(engine, settings.storage_root)
        print("Imported:", ", ".join(f"{name}={count}" for name, count in counts.items()) or "nothing (no snapshot found)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
