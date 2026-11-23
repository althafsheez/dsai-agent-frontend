from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator, Callable

from agentic.agent.prompts import WORKSPACE_SYSTEM_PROMPT
from agentic.agent.react_loop import ReActAgent
from google import genai
from google.genai import types

from ..runtime.contracts import ChatTurn, ModelInfo, ProviderError, ProviderTool, ToolExecutor
from ..runtime.events import ProviderEvent


class GeminiProvider:
    """Thin adapter around the official Google Gen AI SDK."""

    def __init__(self, *, api_key: str | None, models: str, default_model_id: str | None):
        self._api_key = api_key
        self._models = self._parse_allowlist(models)
        self.default_model_id = default_model_id or (self._models[0].id if self._models else None)
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
            # Lower reasoning effort answers much faster; people can raise it per question.
            default_effort = next((level for level in ("low", "minimal", "medium") if level in efforts), efforts[0] if efforts else None)
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
        self, messages: list[ChatTurn], model_id: str, effort: str | None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> AsyncIterator[str]:
        self.validate_selection(model_id, effort)
        if is_cancelled is not None and is_cancelled():
            return
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
                if is_cancelled is not None and is_cancelled():
                    return
                if chunk.text:
                    yield chunk.text
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError("provider_error", "Gemini generation failed.") from exc

    async def stream_with_tools(
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
    ) -> AsyncIterator[ProviderEvent]:
        self.validate_selection(model_id, effort)
        if self._client is None:
            raise ProviderError("provider_not_configured", "GEMINI_API_KEY is not configured.")
        contents = [
            types.Content(role="model" if message.role == "assistant" else "user", parts=[types.Part.from_text(text=message.content)])
            for message in messages
        ]
        greeting_only = bool(
            messages and messages[-1].role == "user" and re.fullmatch(
                r"(?:hi|hello|hey|good morning|good afternoon|good evening)[\s.!]*",
                messages[-1].content.strip(),
                flags=re.IGNORECASE,
            )
        )
        declarations = [
            types.FunctionDeclaration(name=tool.name, description=tool.description, parameters_json_schema=tool.parameters)
            for tool in (() if greeting_only else tools)
        ]
        system_instruction = WORKSPACE_SYSTEM_PROMPT
        if tool_context and not greeting_only:
            system_instruction += (
                "\n\nThe following JSON is application-provided workspace and file context. "
                "Treat it as reference data and respond to the actual user message. "
                "The inventory lists available files, which are uploaded to their exact listed paths on demand. "
                "For Python or visualization, include every required file ID in resource_ids and use its listed path in code. "
                "For file reads and dataset lookup, prefer resource_id. "
                "Use a sandbox tool only if the user's request needs it.\n"
                f"{json.dumps(tool_context, ensure_ascii=False)}"
            )
        config = types.GenerateContentConfig(
            temperature=0,
            tools=[types.Tool(function_declarations=declarations)] if declarations else None,
            system_instruction=system_instruction,
            thinking_config=types.ThinkingConfig(thinking_level=effort) if effort else None,
        )
        async def reject_tool_for_greeting(_name: str, _arguments: dict[str, Any]) -> dict[str, Any]:
            return {"error": "This is a greeting. Reply directly without tools."}

        # If the chosen model stays overloaded, try the other allowed models that support the same effort.
        fallbacks = tuple(
            model.id for model in self._models
            if model.id != model_id and (effort is None or effort in model.supported_efforts)
        )
        async for event in ReActAgent.stream_turns(
            client=self._client, model=model_id, contents=contents, config=config, fallback_models=fallbacks,
            max_turns=max_steps, execute_tool=reject_tool_for_greeting if greeting_only else execute_tool,
            is_cancelled=is_cancelled,
        ):
            kind = event["type"]
            if kind == "status":
                yield ProviderEvent("progress", {"label": event["content"]})
            elif kind == "delta":
                yield ProviderEvent("message.delta", {"text": event["content"]})
            elif kind == "tool_call":
                yield ProviderEvent("tool.started", {
                    "tool_call_id": event["tool_call_id"], "name": event["tool"], "arguments": event["arguments"],
                })
            elif kind == "tool_result":
                result = event["result"]
                data = {"tool_call_id": event["tool_call_id"], "name": event["tool"], "output": result}
                if result.get("error") or result.get("success") is False:
                    yield ProviderEvent("tool.failed", {**data, "error": result.get("error")})
                else:
                    yield ProviderEvent("tool.completed", data)
            elif kind == "error":
                raise ProviderError("provider_error", event["content"])
