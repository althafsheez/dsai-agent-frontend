from __future__ import annotations

import inspect
import time
from collections.abc import AsyncIterator, Callable
from typing import Any
from uuid import uuid4

from ..tools.registry import ToolRegistry
from .contracts import ChatTurn, LLMProvider, ProviderTool, ToolContext
from .events import RunnerCancelled, RunnerEvent, RunnerSteered


class AgentRunner:
    """Enrich provider events with public step details and apply run controls."""

    def __init__(self, provider: LLMProvider, tools: ToolRegistry | None = None, max_steps: int = 8):
        self._provider = provider
        self._tools = tools or ToolRegistry()
        self._max_steps = max_steps

    async def close(self, context: ToolContext) -> None:
        await self._tools.cleanup(context)

    async def run(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        is_cancelled: Callable[[], bool],
        context: ToolContext | None = None,
        poll_steering: Callable[[str], list[str]] | None = None,
    ) -> AsyncIterator[RunnerEvent]:
        def check_control(checkpoint: str) -> None:
            if is_cancelled():
                raise RunnerCancelled
            if poll_steering is not None:
                instructions = poll_steering(checkpoint)
                if instructions:
                    raise RunnerSteered(instructions)

        check_control("before.model")
        definitions = self._tools.definitions()
        stream_with_tools = getattr(self._provider, "stream_with_tools", None)
        if definitions and context is not None and callable(stream_with_tools):
            provider_tools = tuple(ProviderTool(tool.name, tool.description, tool.parameters) for tool in definitions)
            steering_after_tool: list[str] = []
            pending_steps: list[ToolContext] = []
            steps: dict[str, tuple[str, float, str]] = {}

            async def execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
                if is_cancelled():
                    raise RunnerCancelled
                check_control("before.tool")
                step_context = pending_steps.pop(0) if pending_steps else context.for_step(str(uuid4()), name)
                result = await self._tools.execute(name, arguments, step_context)
                if poll_steering is not None:
                    steering_after_tool.extend(poll_steering("after.tool"))
                return result

            prepared = await self._tools.prepare(context)
            parameters = inspect.signature(stream_with_tools).parameters
            options = {}
            if "is_cancelled" in parameters:
                options["is_cancelled"] = is_cancelled
            if "tool_context" in parameters:
                options["tool_context"] = prepared
            provider_stream = stream_with_tools(
                messages,
                model_id,
                effort,
                provider_tools,
                execute_tool,
                self._max_steps,
                **options,
            )
            async for event in provider_stream:
                # A completed tool result is public progress and must be
                # persisted before cancellation/steering ends the loop.
                if event.type != "tool.completed":
                    check_control("provider.event")
                event_data = dict(event.data)
                if event.type == "tool.started":
                    provider_call_id = str(event_data.get("tool_call_id") or uuid4())
                    name = str(event_data.get("name") or "tool")
                    step_id = str(uuid4())
                    pending_steps.append(context.for_step(step_id, name))
                    steps[provider_call_id] = (step_id, time.perf_counter(), name)
                    arguments = event_data.get("arguments") if isinstance(event_data.get("arguments"), dict) else {}
                    event_data.update({
                        "step_id": step_id,
                        "run_id": context.run_id,
                        "message_id": context.assistant_message_id,
                        "summary": f"Starting {name.replace('_', ' ')}.",
                        "code": arguments.get("code"),
                        "sql": arguments.get("sql"),
                        "input_resources": list(self._tools.input_resources(name, arguments, context)),
                    })
                elif event.type in ("tool.completed", "tool.failed"):
                    provider_call_id = str(event_data.get("tool_call_id") or "")
                    step_id, started_at, name = steps.get(provider_call_id, (str(uuid4()), time.perf_counter(), str(event_data.get("name") or "tool")))
                    output = event_data.get("output") if isinstance(event_data.get("output"), dict) else {}
                    event_data.update({
                        "step_id": step_id,
                        "run_id": context.run_id,
                        "message_id": context.assistant_message_id,
                        "duration_ms": max(0, round((time.perf_counter() - started_at) * 1000)),
                        "summary": (
                            f"{name.replace('_', ' ').capitalize()} failed."
                            if event.type == "tool.failed"
                            else f"Completed {name.replace('_', ' ')}."
                        ),
                        "resources": output.get("resources", []),
                    })
                yield RunnerEvent(type=event.type, data=event_data)
                if event.type == "tool.completed" and is_cancelled():
                    raise RunnerCancelled
                if steering_after_tool:
                    instructions = steering_after_tool.copy()
                    steering_after_tool.clear()
                    raise RunnerSteered(instructions)
            return
        stream_text = self._provider.stream_text
        supports_cancel_callback = "is_cancelled" in inspect.signature(stream_text).parameters
        provider_stream = stream_text(messages, model_id, effort, is_cancelled=is_cancelled) if supports_cancel_callback else stream_text(messages, model_id, effort)
        async for text in provider_stream:
            check_control("before.final")
            if text:
                yield RunnerEvent(type="message.delta", data={"text": text})
