from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any


@dataclass
class ToolContext:
    run_id: str
    chat_id: str
    user_id: str
    assistant_message_id: str = ""
    step_id: str | None = None
    tool_name: str | None = None
    input_resources: tuple[dict[str, Any], ...] = ()

    def for_step(self, step_id: str, tool_name: str) -> "ToolContext":
        return ToolContext(
            run_id=self.run_id,
            chat_id=self.chat_id,
            user_id=self.user_id,
            assistant_message_id=self.assistant_message_id,
            step_id=step_id,
            tool_name=tool_name,
            input_resources=self.input_resources,
        )


ToolHandler = Callable[[dict[str, Any], ToolContext], Awaitable[dict[str, Any]]]
CleanupHandler = Callable[[ToolContext], Awaitable[None]]
PrepareHandler = Callable[[ToolContext], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler


class ToolRegistry:
    """Allowlisted tool registry with JSON schemas exposed to Gemini."""

    def __init__(self, prepare: PrepareHandler | None = None, cleanup: CleanupHandler | None = None) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._prepare = prepare
        self._cleanup = cleanup

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise ValueError(f"Unknown tool: {name}") from exc

    def definitions(self) -> tuple[ToolDefinition, ...]:
        return tuple(self._tools.values())

    async def execute(self, name: str, arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await self.get(name).handler(arguments, context)

    async def cleanup(self, context: ToolContext) -> None:
        if self._cleanup is not None:
            await self._cleanup(context)

    async def prepare(self, context: ToolContext) -> dict[str, Any]:
        return await self._prepare(context) if self._prepare is not None else {}
