from __future__ import annotations

from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from ..config import Settings
from .types import ChatTurn, ModelInfo, ProviderError


class GeminiProvider:
    """Thin adapter around the official Google Gen AI SDK."""

    def __init__(self, settings: Settings):
        self._api_key = settings.gemini_api_key
        self._models = self._parse_allowlist(settings.gemini_models)
        self.default_model_id = settings.default_model_id or (self._models[0].id if self._models else None)
        self._client = genai.Client(api_key=self._api_key) if self._api_key else None

    @staticmethod
    def _parse_allowlist(raw: str) -> list[ModelInfo]:
        models: list[ModelInfo] = []
        for entry in (part.strip() for part in raw.split(",")):
            if not entry:
                continue
            model_id, separator, effort_text = entry.partition(":")
            efforts = tuple(item.strip().lower() for item in effort_text.split("|") if item.strip())
            if not separator:
                efforts = ()
            default_effort = "medium" if "medium" in efforts else (efforts[0] if efforts else None)
            models.append(
                ModelInfo(
                    id=model_id,
                    label=model_id.replace("-", " ").title(),
                    supported_efforts=efforts,
                    default_effort=default_effort,
                )
            )
        return models

    async def list_models(self) -> tuple[list[ModelInfo], str]:
        if not self._models:
            return [], "No Gemini model allowlist is configured."
        if self._client is None:
            return [], "Models are configured; GEMINI_API_KEY is not set."

        try:
            pager = await self._client.aio.models.list(config={"page_size": 100})
            available: set[str] = set()
            async for model in pager:
                name = str(getattr(model, "name", ""))
                available.add(name.removeprefix("models/"))
            discovered = [model for model in self._models if model.id in available]
            return discovered, "ready" if discovered else "Configured models were not returned by Gemini."
        except Exception as exc:  # SDK exceptions vary by transport and status.
            raise ProviderError("model_discovery_failed", "Gemini model discovery failed.") from exc

    def validate_selection(self, model_id: str, effort: str | None) -> ModelInfo:
        selected = next((model for model in self._models if model.id == model_id), None)
        if selected is None:
            raise ProviderError("invalid_model", "The selected Gemini model is not allowed.")
        if effort is not None and effort not in selected.supported_efforts:
            raise ProviderError("invalid_effort", "The selected reasoning effort is not supported by this model.")
        return selected

    async def stream_text(
        self, messages: list[ChatTurn], model_id: str, effort: str | None
    ) -> AsyncIterator[str]:
        self.validate_selection(model_id, effort)
        if self._client is None:
            raise ProviderError("provider_not_configured", "GEMINI_API_KEY is not configured.")

        contents = [
            types.Content(
                role="model" if message.role == "assistant" else "user",
                parts=[types.Part.from_text(text=message.content)],
            )
            for message in messages
        ]
        config = None
        if effort:
            config = types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level=effort)
            )
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=model_id,
                contents=contents,
                config=config,
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError("provider_error", "Gemini generation failed.") from exc
