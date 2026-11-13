from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ModelInfo:
    id: str
    label: str
    supported_efforts: tuple[str, ...]
    default_effort: str | None


@dataclass(frozen=True)
class ChatTurn:
    role: str
    content: str


@dataclass(frozen=True)
class ProviderTool:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ProviderEvent:
    type: str
    data: dict[str, Any]


ToolExecutor = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class LLMProvider(Protocol):
    async def list_models(self) -> tuple[list[ModelInfo], str]: ...

    def validate_selection(self, model_id: str, effort: str | None) -> ModelInfo: ...

    async def stream_text(
        self, messages: list[ChatTurn], model_id: str, effort: str | None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> AsyncIterator[str]: ...

    async def stream_with_tools(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        tools: tuple[ProviderTool, ...],
        execute_tool: ToolExecutor,
        max_steps: int,
        is_cancelled: Callable[[], bool] | None = None,
        poll_steering: Callable[[str], list[str]] | None = None,
    ) -> AsyncIterator[ProviderEvent]: ...
