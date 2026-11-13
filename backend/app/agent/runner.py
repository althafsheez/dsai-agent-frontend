from __future__ import annotations

import inspect
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from ..providers import ChatTurn, LLMProvider, ProviderTool
from .tools import ToolContext, ToolRegistry


logger = logging.getLogger(__name__)


class RunnerCancelled(Exception):
    pass


class RunnerSteered(Exception):
    def __init__(self, instructions: list[str]):
        super().__init__("The active run received a steering instruction.")
        self.instructions = instructions


@dataclass(frozen=True)
class RunnerEvent:
    type: str
    data: dict[str, Any]


class AgentRunner:
    """Own the run's tool lifecycle and forward public provider events."""

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
        poll_steering: Callable[[str], list[str]] | None = None,
    ) -> AsyncIterator[RunnerEvent]:
        definitions = self._tools.definitions()
        stream_with_tools = getattr(self._provider, "stream_with_tools", None)
        tool_parameters = inspect.signature(stream_with_tools).parameters if callable(stream_with_tools) else {}
        native_steering = bool(definitions and context is not None and "poll_steering" in tool_parameters)

        def check_control(checkpoint: str) -> None:
            if is_cancelled():
                raise RunnerCancelled
            if poll_steering is not None and not native_steering:
                instructions = poll_steering(checkpoint)
                if instructions:
                    raise RunnerSteered(instructions)

        check_control("before.model")
        if definitions and context is not None and callable(stream_with_tools):
            provider_tools = tuple(ProviderTool(tool.name, tool.description, tool.parameters) for tool in definitions)
            steering_after_tool: list[str] = []

            async def execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
                if is_cancelled():
                    raise RunnerCancelled
                check_control("before.tool")
                try:
                    result = await self._tools.execute(name, arguments, context)
                except (RunnerCancelled, RunnerSteered):
                    raise
                except Exception:
                    logger.exception("Tool %s failed in run %s", name, context.run_id)
                    result = {"success": False, "error": f"Tool {name} failed. Check its arguments and retry."}
                if poll_steering is not None and not native_steering:
                    steering_after_tool.extend(poll_steering("after.tool"))
                return result

            provider_stream = None
            try:
                prepared = await self._tools.prepare(context)
                tool_messages = messages
                if prepared:
                    tool_messages = [*messages, ChatTurn(role="user", content=f"Authorized tool context (system-provided): {prepared}")]
                controls = {}
                if "is_cancelled" in tool_parameters:
                    controls["is_cancelled"] = is_cancelled
                if native_steering:
                    controls["poll_steering"] = poll_steering
                provider_stream = stream_with_tools(tool_messages, model_id, effort, provider_tools, execute_tool, self._max_steps, **controls)
                async for event in provider_stream:
                    # A completed tool result is public progress and must be
                    # persisted before cancellation/steering ends the loop.
                    if event.type not in ("tool.completed", "tool.failed"):
                        check_control("provider.event")
                    yield RunnerEvent(type=event.type, data=event.data)
                    if event.type in ("tool.completed", "tool.failed") and is_cancelled():
                        raise RunnerCancelled
                    if steering_after_tool:
                        instructions = steering_after_tool.copy()
                        steering_after_tool.clear()
                        raise RunnerSteered(instructions)
            finally:
                try:
                    close_stream = getattr(provider_stream, "aclose", None)
                    if callable(close_stream):
                        await close_stream()
                finally:
                    await self._tools.cleanup(context)
            return
        stream_text = self._provider.stream_text
        supports_cancel_callback = "is_cancelled" in inspect.signature(stream_text).parameters
        provider_stream = stream_text(messages, model_id, effort, is_cancelled=is_cancelled) if supports_cancel_callback else stream_text(messages, model_id, effort)
        async for text in provider_stream:
            check_control("before.final")
            if text:
                yield RunnerEvent(type="message.delta", data={"text": text})
