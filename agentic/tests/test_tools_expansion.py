import pytest
from typing import Any, Dict
from agentic.tools.base import BaseTool
from agentic.tools.registry import ToolRegistry, create_default_registry
from agentic.agent.react_loop import ReActAgent
from agentic.engine.duckdb_engine import DuckDBEngine
from agentic.engine.python_worker import WarmPythonWorker


class CustomEchoTool(BaseTool):
    @property
    def name(self) -> str:
        return "custom_echo"

    @property
    def description(self) -> str:
        return "Echoes back the input message for testing tool expansion."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Message to echo"},
            },
            "required": ["message"],
        }

    def execute(self, message: str = "", **kwargs: Any) -> Dict[str, Any]:
        return {"echo": message, "status": "success"}


def test_default_tool_registry():
    registry = create_default_registry()
    tools = registry.list_tools()
    tool_names = [t.name for t in tools]
    
    assert "run_duckdb_sql" in tool_names
    assert "run_python_code" in tool_names
    assert "web_search" in tool_names

    # Check Gemini schema conversion
    gemini_tools = registry.get_gemini_tools()
    assert len(gemini_tools) == 1
    declarations = gemini_tools[0].function_declarations
    assert len(declarations) == 3
    assert {d.name for d in declarations} == {"run_duckdb_sql", "run_python_code", "web_search"}


def test_custom_tool_registration_and_execution():
    registry = create_default_registry()
    custom_tool = CustomEchoTool()
    registry.register(custom_tool)

    assert registry.get("custom_echo") is not None
    gemini_tools = registry.get_gemini_tools()
    declarations = gemini_tools[0].function_declarations
    assert len(declarations) == 4
    assert any(d.name == "custom_echo" for d in declarations)

    # Test tool execution
    res = registry.execute("custom_echo", {"message": "hello world"})
    assert res == {"echo": "hello world", "status": "success"}


def test_react_agent_with_custom_registry():
    duckdb = DuckDBEngine()
    python_worker = WarmPythonWorker()
    registry = create_default_registry(duckdb_engine=duckdb, python_worker=python_worker)
    registry.register(CustomEchoTool())

    agent = ReActAgent(
        duckdb_engine=duckdb,
        python_worker=python_worker,
        tool_registry=registry,
    )

    # Verify agent delegates execution
    res = agent.execute_tool("custom_echo", {"message": "expansion verified"})
    assert res["echo"] == "expansion verified"
    assert res["status"] == "success"
