"""Run versioned schema upgrades and retain a consistent SQLite backup."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.engine import Engine


def upgrade_schema(engine: Engine) -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    with engine.connect() as connection:
        current = set(MigrationContext.configure(connection).get_current_heads())
        if current == set(script.get_heads()):
            return

        # SQLite's backup API includes committed WAL contents and does not require
        # stopping readers. Never overwrite an earlier backup.
        database = engine.url.database
        if engine.dialect.name == "sqlite" and database and database != ":memory:" and inspect(connection).get_table_names():
            path = Path(database).resolve()
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = path.with_name(f"{path.name}.backup-{stamp}-{uuid4().hex[:8]}")
            with backup.open("xb"):
                pass
            try:
                with sqlite3.connect(backup) as destination:
                    connection.connection.driver_connection.backup(destination)
            except BaseException:
                backup.unlink(missing_ok=True)
                raise

        config.attributes["connection"] = connection
        connection.commit()
        command.upgrade(config, "head")
        connection.commit()
