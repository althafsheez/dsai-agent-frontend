from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from agentic.execution.e2b import E2BSandboxPool
from agentic.runtime.contracts import InputSource, ToolContext
from agentic.tools.defaults import build_tool_registry
from app.config import Settings
from app.db import Base, make_engine, make_session_factory
from app.models import User
from app.services.agent_adapter import AgentToolAdapter
from app.storage import LocalFileStorage


@pytest.fixture
def tool_setup(tmp_path):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'tools.db'}",
        storage_root=tmp_path / "storage",
        tavily_api_key=None,
        e2b_api_key=None,
    )
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        session.add(User(id="user-tools", name="Tool User", initials="TU"))
        session.commit()
    pool = E2BSandboxPool(None)
    adapter = AgentToolAdapter(factory, LocalFileStorage(settings.storage_root))
    registry = build_tool_registry(pool, adapter, tavily_api_key=settings.tavily_api_key)
    return registry, ToolContext("run-1", "chat-1", "user-tools")


async def test_memory_is_user_scoped_and_persistent(tool_setup) -> None:
    registry, context = tool_setup
    assert (await registry.execute("save_memory", {"key": "currency", "value": "Use INR"}, context))["success"]
    loaded = await registry.execute("load_memory", {}, context)
    assert loaded == {"memories": [{"key": "currency", "value": "Use INR"}]}


async def test_unconfigured_external_tools_fail_safely(tool_setup) -> None:
    registry, context = tool_setup
    assert "TAVILY_API_KEY" in (await registry.execute("web_search", {"query": "latest data"}, context))["error"]
    execution = await registry.execute("execute_python", {"code": "print(1)"}, context)
    assert execution["success"] is False
    assert execution["error"] == "E2B is not configured"
    assert execution["diagnostic"]["code"] == "e2b_not_configured"
    assert execution["diagnostic"]["stage"] == "sandbox_startup"


async def test_dataset_lookup_rejects_mutating_sql_before_sandbox(tool_setup) -> None:
    registry, context = tool_setup
    result = await registry.execute("lookup_data", {"path": "/home/user/inputs/data.csv", "sql": "DROP TABLE dataset"}, context)
    assert result == {"error": "Only one read-only SELECT query is allowed."}


def test_sandbox_paths_are_strictly_scoped() -> None:
    assert E2BSandboxPool._safe_path("/home/user/inputs/data.csv") == "/home/user/inputs/data.csv"
    assert E2BSandboxPool._safe_path(".") == "/home/user"
    assert E2BSandboxPool._safe_path("inputs/data.csv") == "/home/user/inputs/data.csv"
    assert E2BSandboxPool._safe_path("/home/user") == "/home/user"
    assert E2BSandboxPool._safe_path("/home/user/outputs/chart.png", writable=True) == "/home/user/outputs/chart.png"
    assert E2BSandboxPool._safe_path("chart.png", writable=True) == "/home/user/outputs/chart.png"
    with pytest.raises(ValueError):
        E2BSandboxPool._safe_path("/etc/passwd")
    with pytest.raises(ValueError):
        E2BSandboxPool._safe_path("/home/user/inputs/secret.txt", writable=True)


async def test_concurrent_selection_reuses_upload_and_revalidates_on_subsequent_tools(monkeypatch) -> None:
    pool = E2BSandboxPool(None)
    resource_id, filename = "allowed", "allowed-iris.csv"
    path = pool.input_path(filename)
    source = InputSource(filename, lambda: b"value\n4\n")
    available = {resource_id: source}
    context = ToolContext("one-run", "chat", "user", input_resources=(
        {"resource_id": resource_id, "path": path},
    ))

    class Host:
        def resolve_inputs(self, context, resource_ids):
            return {key: available[key] for key in resource_ids if key in available}

    upload_entered = asyncio.Event()
    release = asyncio.Event()

    async def upload(run_id, filename, content):
        upload_entered.set()
        await release.wait()
        return path

    upload = AsyncMock(side_effect=upload)
    monkeypatch.setattr(pool, "upload_input", upload)
    read = AsyncMock(return_value={"content": "value\n4\n"})
    monkeypatch.setattr(pool, "read_text", read)
    close = AsyncMock()
    monkeypatch.setattr(pool, "close", close)
    missing_file = AsyncMock(return_value={"success": False, "error": "FileNotFoundError: missing"})
    monkeypatch.setattr(pool, "execute", missing_file)
    registry = build_tool_registry(pool, Host(), tavily_api_key=None)

    first = asyncio.create_task(registry.execute("read_file", {"resource_id": resource_id}, context))
    await upload_entered.wait()
    second = asyncio.create_task(registry.execute("read_file", {"path": path}, context))
    release.set()
    assert await asyncio.gather(first, second) == [{"content": "value\n4\n"}] * 2
    upload.assert_awaited_once_with(context.run_id, filename, b"value\n4\n")

    failure = await registry.execute("execute_python", {"code": "open('missing')"}, context)
    assert "retry with its ID in resource_ids" in failure["error"]
    assert upload.await_count == 1

    available.clear()
    denied = await registry.execute("execute_python", {"code": "open('previously staged')"}, context)
    assert "unavailable in this chat" in denied["error"]
    assert missing_file.await_count == 1
    close.assert_awaited_once_with(context.run_id)

    await registry.cleanup(context)
    available[resource_id] = source
    await registry.execute("read_file", {"resource_id": resource_id}, context)
    assert upload.await_count == 2
    await registry.cleanup(context)


async def test_python_without_files_initializes_one_sandbox_and_uploads_nothing(monkeypatch, caplog) -> None:
    from e2b_code_interpreter import Sandbox

    files = SimpleNamespace(make_dir=Mock(), write=Mock(), list=Mock(return_value=[]))
    sandbox = SimpleNamespace(
        files=files,
        commands=SimpleNamespace(run=Mock()),
        run_code=Mock(return_value=SimpleNamespace(error=None, logs=None)),
        kill=Mock(),
    )
    create = Mock(return_value=sandbox)
    monkeypatch.setattr(Sandbox, "create", create)
    monkeypatch.setattr(logging.getLogger("agentic.performance"), "disabled", False)
    pool = E2BSandboxPool("test-key")
    with caplog.at_level(logging.INFO, "agentic.performance"):
        try:
            assert (await pool.execute("private-run-id", "print(42)", 10))["success"]
            assert (await pool.execute("private-run-id", "print(43)", 10))["success"]
            sandbox.commands.run.assert_not_called()
            assert (await pool.execute("private-run-id", "import reportlab", 10))["success"]
            assert (await pool.execute("private-run-id", "import reportlab", 10))["success"]
            sandbox.commands.run.assert_called_once()
            assert (await pool.execute("private-run-id", "import duckdb, reportlab", 10))["success"]
            assert (await pool.execute("private-run-id", "import duckdb", 10))["success"]
            assert sandbox.commands.run.call_count == 2
            assert "duckdb==" in sandbox.commands.run.call_args.args[0]
        finally:
            await pool.close("private-run-id")
    create.assert_called_once()
    files.write.assert_not_called()
    sandbox.kill.assert_called_once()
    assert "e2b_sandbox_init" in caplog.text and "e2b_dependency_prep" in caplog.text
    assert "private-run-id" not in caplog.text and "test-key" not in caplog.text
