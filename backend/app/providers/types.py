from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


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


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class LLMProvider(Protocol):
    async def list_models(self) -> tuple[list[ModelInfo], str]: ...

    def validate_selection(self, model_id: str, effort: str | None) -> ModelInfo: ...

    async def stream_text(
        self, messages: list[ChatTurn], model_id: str, effort: str | None
    ) -> AsyncIterator[str]: ...
