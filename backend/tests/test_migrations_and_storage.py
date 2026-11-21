from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.storage import LocalFileStorage
from app.main import create_app
from app.models import AgentRun, Chat, Message, Workspace


def test_initial_migration_creates_expected_tables(tmp_path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DSAI_DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config("backend/alembic.ini")
    command.upgrade(config, "head")

    tables = set(inspect(create_engine(database_url)).get_table_names())
    assert {"users", "workspaces", "chats", "messages", "agent_runs", "execution_events", "file_objects", "resources", "resource_links", "favorites", "alembic_version"} <= tables
    get_settings.cache_clear()


async def test_startup_upgrades_existing_database_and_preserves_records(tmp_path, provider) -> None:
    path = tmp_path / "existing.db"
    settings = Settings(database_url=f"sqlite:///{path}", storage_root=tmp_path / "storage")
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        with app.state.session_factory() as session:
            workspace = Workspace(id="workspace", name="Existing workspace", created_by="user-you")
            chat = Chat(id="chat", title="Existing chat", workspace_id="workspace", created_by="user-you", client_request_id="chat-request", is_unread=True)
            message = Message(id="message", chat_id="chat", role="user", content="Keep this", position=1)
            run = AgentRun(id="run", chat_id="chat", user_message_id="message", assistant_message_id="message", status="completed", model_id="model", client_request_id="run-request")
            session.add_all([workspace, chat, message, run])
            session.commit()

    engine = create_engine(settings.database_url)
    config = Config("backend/alembic.ini")
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "20261113_0008")
        connection.commit()
    engine.dispose()
    assert "pinned_at" not in {c["name"] for c in inspect(create_engine(settings.database_url)).get_columns("chats")}

    upgraded = create_app(settings=settings, provider=provider)
    async with upgraded.router.lifespan_context(upgraded):
        async with AsyncClient(transport=ASGITransport(app=upgraded), base_url="http://test") as client:
            for url in ("/api/chats", "/api/chats/activity/list"):
                response = await client.get(url, headers={"X-Demo-User-Id": "user-you"})
                assert response.status_code == 200, response.text
                assert any(item["id"] == "chat" for item in response.json()["items"])
        with upgraded.state.session_factory() as session:
            assert session.get(Workspace, "workspace").name == "Existing workspace"
            assert session.get(Chat, "chat").workspace_id == "workspace"
            assert session.get(Message, "message").content == "Keep this"
            assert session.get(AgentRun, "run").status == "completed"
            assert session.scalar(select(Chat.pinned_at)) is None

    backups = list(tmp_path.glob("existing.db.backup-*"))
    assert len(backups) == 1
    backup_engine = create_engine(f"sqlite:///{backups[0]}")
    assert "pinned_at" not in {c["name"] for c in inspect(backup_engine).get_columns("chats")}
    with backup_engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT content FROM messages WHERE id = 'message'").scalar_one() == "Keep this"
    backup_engine.dispose()
    async with upgraded.router.lifespan_context(upgraded):
        pass
    assert len(list(tmp_path.glob("existing.db.backup-*"))) == 1


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
