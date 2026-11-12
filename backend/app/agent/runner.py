from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from ..providers import ChatTurn, LLMProvider, ProviderTool
from .tools import ToolContext, ToolRegistry


class RunnerCancelled(Exception):
    pass


@dataclass(frozen=True)
class RunnerEvent:
    type: str
    data: dict[str, Any]


class AgentRunner:
    """Provider-independent single-agent loop; tool iterations can be added here."""

    def __init__(self, provider: LLMProvider, tools: ToolRegistry | None = None, max_steps: int = 8):
        self._provider = provider
        self._tools = tools or ToolRegistry()
        self._max_steps = max_steps

    async def run(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        is_cancelled: Callable[[], bool],
        context: ToolContext | None = None,
    ) -> AsyncIterator[RunnerEvent]:
        if is_cancelled():
            raise RunnerCancelled
        definitions = self._tools.definitions()
        stream_with_tools = getattr(self._provider, "stream_with_tools", None)
        if definitions and context is not None and callable(stream_with_tools):
            provider_tools = tuple(ProviderTool(tool.name, tool.description, tool.parameters) for tool in definitions)

            async def execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
                if is_cancelled():
                    raise RunnerCancelled
                return await self._tools.execute(name, arguments, context)

            try:
                prepared = await self._tools.prepare(context)
                tool_messages = messages
                if prepared:
                    tool_messages = [*messages, ChatTurn(role="user", content=f"Authorized tool context (system-provided): {prepared}")]
                async for event in stream_with_tools(tool_messages, model_id, effort, provider_tools, execute_tool, self._max_steps):
                    if is_cancelled():
                        raise RunnerCancelled
                    yield RunnerEvent(type=event.type, data=event.data)
            finally:
                await self._tools.cleanup(context)
            return
        async for text in self._provider.stream_text(messages, model_id, effort):
            if is_cancelled():
                raise RunnerCancelled
            if text:
                yield RunnerEvent(type="message.delta", data={"text": text})
