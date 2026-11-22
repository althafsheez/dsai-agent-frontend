from __future__ import annotations
import inspect
from typing import Any, Callable, Dict, List, Optional
from google.genai import types

from backend.tools.base import BaseTool
from backend.tools.duckdb_tool import DuckDBSQLTool
from backend.tools.python_tool import PythonCodeTool
from backend.tools.search_tool import WebSearchTool


class ToolRegistry:
    """
    Central registry for managing, registering, and dispatching agent tools.
    Encapsulates tool definitions for Gemini and dispatches tool execution.
    """

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> BaseTool:
        """Register a new tool instance in the registry."""
        self._tools[tool.name] = tool
        return tool

    def get(self, name: str) -> Optional[BaseTool]:
        """Retrieve a registered tool by its name."""
        return self._tools.get(name)

    def list_tools(self) -> List[BaseTool]:
        """Return all registered tool instances."""
        return list(self._tools.values())

    def get_gemini_tools(self) -> List[types.Tool]:
        """Generate Google GenAI Tool declaration object containing all registered tools."""
        declarations = [tool.to_gemini_declaration() for tool in self._tools.values()]
        return [types.Tool(function_declarations=declarations)] if declarations else []

    async def execute_async(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name, handling async or sync transparently."""
        tool = self._tools.get(name)
        if not tool:
            return {"error": f"Unknown tool: '{name}'"}
        try:
            if inspect.iscoroutinefunction(tool.execute):
                return await tool.execute(**args)
            return tool.execute(**args)
        except Exception as exc:
            return {"error": f"Tool '{name}' execution failed: {str(exc)}"}

    def execute(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool synchronously."""
        tool = self._tools.get(name)
        if not tool:
            return {"error": f"Unknown tool: '{name}'"}
        try:
            return tool.execute(**args)
        except Exception as exc:
            return {"error": f"Tool '{name}' execution failed: {str(exc)}"}


def create_default_registry(
    duckdb_engine: Optional[Any] = None,
    python_worker: Optional[Any] = None,
) -> ToolRegistry:
    """Factory creating the default ToolRegistry with DuckDB, Python, and Web Search."""
    registry = ToolRegistry()
    registry.register(DuckDBSQLTool(duckdb_engine=duckdb_engine))
    registry.register(PythonCodeTool(python_worker=python_worker))
    registry.register(WebSearchTool())
    return registry
