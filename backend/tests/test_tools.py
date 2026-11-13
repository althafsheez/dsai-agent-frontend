from __future__ import annotations

import pytest

from app.agent.default_tools import build_tool_registry
from app.agent.sandbox import E2BSandboxPool
from app.agent.tools import ToolContext
from app.config import Settings
from app.db import Base, make_engine, make_session_factory
from app.models import User
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
    return build_tool_registry(settings, factory, pool, LocalFileStorage(settings.storage_root)), ToolContext("run-1", "chat-1", "user-tools")


async def test_memory_is_user_scoped_and_persistent(tool_setup) -> None:
    registry, context = tool_setup
    assert (await registry.execute("save_memory", {"key": "currency", "value": "Use INR"}, context))["success"]
    loaded = await registry.execute("load_memory", {}, context)
    assert loaded == {"memories": [{"key": "currency", "value": "Use INR"}]}


async def test_unconfigured_external_tools_fail_safely(tool_setup) -> None:
    registry, context = tool_setup
    assert "TAVILY_API_KEY" in (await registry.execute("web_search", {"query": "latest data"}, context))["error"]
    execution = await registry.execute("execute_python", {"code": "print(1)"}, context)
    assert execution == {"success": False, "error": "E2B_API_KEY is not configured."}


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
