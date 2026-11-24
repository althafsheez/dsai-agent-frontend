from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from .events import ProviderEvent, RunnerEvent


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


ToolExecutor = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class InputSource:
    filename: str
    read_bytes: Callable[[], bytes]


class ToolHost(Protocol):
    """Supply authorized application data and persist effects of tool calls."""

    async def prepare(self, context: ToolContext, input_path: Callable[[str], str]) -> dict[str, Any]: ...

    def resolve_inputs(self, context: ToolContext, resource_ids: tuple[str, ...]) -> dict[str, InputSource]: ...

    def register_output(
        self, context: ToolContext, path: str, name: str, extension: str, digest: str, content: bytes,
    ) -> dict[str, Any]: ...

    async def save_memory(self, context: ToolContext, key: str, value: str) -> dict[str, Any]: ...

    async def load_memory(self, context: ToolContext) -> dict[str, Any]: ...


class ProviderError(Exception):
    def __init__(self, code: str, message: str, diagnostic: dict[str, Any] | None = None):
        self.code = code
        self.diagnostic = diagnostic
        super().__init__(message)


class LLMProvider(Protocol):
    async def list_models(self) -> tuple[list[ModelInfo], str]: ...

    def validate_selection(self, model_id: str, effort: str | None) -> ModelInfo: ...

    def stream_text(
        self, messages: list[ChatTurn], model_id: str, effort: str | None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> AsyncIterator[str]: ...

    def stream_with_tools(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        tools: tuple[ProviderTool, ...],
        execute_tool: ToolExecutor,
        max_steps: int,
        is_cancelled: Callable[[], bool] | None = None,
        *,
        tool_context: dict[str, Any] | None = None,
    ) -> AsyncIterator[ProviderEvent]: ...


class AgentExecution(Protocol):
    """Execute a run and stream public events through the application boundary."""

    def run(
        self,
        messages: list[ChatTurn],
        model_id: str,
        effort: str | None,
        is_cancelled: Callable[[], bool],
        context: ToolContext | None = None,
        poll_steering: Callable[[str], list[str]] | None = None,
    ) -> AsyncIterator[RunnerEvent]: ...

    async def close(self, context: ToolContext) -> None: ...
