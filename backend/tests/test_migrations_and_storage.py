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


def test_settings_accept_conventional_tool_api_key_names(monkeypatch) -> None:
    monkeypatch.delenv("DSAI_TAVILY_API_KEY", raising=False)
    monkeypatch.delenv("DSAI_E2B_API_KEY", raising=False)
    monkeypatch.setenv("TAVILY_API_KEY", "tavily-test-key")
    monkeypatch.setenv("E2B_API_KEY", "e2b-test-key")

    settings = Settings(_env_file=None)

    assert settings.tavily_api_key == "tavily-test-key"
    assert settings.e2b_api_key == "e2b-test-key"


def test_prefixed_tool_api_key_names_take_precedence(monkeypatch) -> None:
    monkeypatch.setenv("DSAI_TAVILY_API_KEY", "prefixed-tavily")
    monkeypatch.setenv("TAVILY_API_KEY", "conventional-tavily")
    monkeypatch.setenv("DSAI_E2B_API_KEY", "prefixed-e2b")
    monkeypatch.setenv("E2B_API_KEY", "conventional-e2b")

    settings = Settings(_env_file=None)

    assert settings.tavily_api_key == "prefixed-tavily"
    assert settings.e2b_api_key == "prefixed-e2b"
