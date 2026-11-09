from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.config import Settings, get_settings
from app.storage import LocalFileStorage


def test_initial_migration_creates_expected_tables(tmp_path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DSAI_DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config("backend/alembic.ini")
    command.upgrade(config, "head")

    tables = set(inspect(create_engine(database_url)).get_table_names())
    assert {
        "users",
        "workspaces",
        "chats",
        "messages",
        "agent_runs",
        "execution_events",
        "file_objects",
        "resources",
        "resource_links",
        "favorites",
        "alembic_version",
    } <= tables
    get_settings.cache_clear()


def test_local_storage_generates_paths_and_rejects_escape(tmp_path) -> None:
    storage = LocalFileStorage(tmp_path / "storage")
    stored = storage.store_bytes(b"safe bytes")
    assert stored.relative_path != "safe bytes"
    assert storage.read_bytes(stored.relative_path) == b"safe bytes"

    try:
        storage.read_bytes("../outside")
    except ValueError as exc:
        assert "Invalid storage path" in str(exc)
    else:
        raise AssertionError("Storage accepted a path escape")


def test_comma_separated_cors_origins(monkeypatch) -> None:
    monkeypatch.setenv("DSAI_CORS_ORIGINS", "http://localhost:3000,https://example.test")
    assert Settings().cors_origins == ["http://localhost:3000", "https://example.test"]
