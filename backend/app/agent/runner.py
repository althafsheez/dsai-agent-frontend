from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from ..providers import ChatTurn, LLMProvider
from .tools import ToolRegistry


class RunnerCancelled(Exception):
    pass


@dataclass(frozen=True)
class RunnerEvent:
    type: str
    data: dict[str, Any]


class AgentRunner:
    """Provider-independent single-agent loop; tool iterations can be added here."""

    def __init__(self, provider: LLMProvider, tools: ToolRegistry | None = None):
        self._provider = provider
        self._tools = tools or ToolRegistry()

    async def run(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        is_cancelled: Callable[[], bool],
    ) -> AsyncIterator[RunnerEvent]:
        if is_cancelled():
            raise RunnerCancelled
        async for text in self._provider.stream_text(messages, model_id, effort):
            if is_cancelled():
                raise RunnerCancelled
            if text:
                yield RunnerEvent(type="message.delta", data={"text": text})
