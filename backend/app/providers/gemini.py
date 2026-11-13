from __future__ import annotations

from collections.abc import AsyncIterator, Callable

from google import genai
from google.genai import types

from ..config import Settings
from .types import ChatTurn, ModelInfo, ProviderError, ProviderEvent, ProviderTool, ToolExecutor


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
    ) -> AsyncIterator[ProviderEvent]:
        self.validate_selection(model_id, effort)
        if self._client is None:
            raise ProviderError("provider_not_configured", "GEMINI_API_KEY is not configured.")
        contents = [
            types.Content(role="model" if message.role == "assistant" else "user", parts=[types.Part.from_text(text=message.content)])
            for message in messages
        ]
        declarations = [
            types.FunctionDeclaration(name=tool.name, description=tool.description, parameters_json_schema=tool.parameters)
            for tool in tools
        ]
        config = types.GenerateContentConfig(
            temperature=0,
            tools=[types.Tool(function_declarations=declarations)],
            system_instruction=(
                "You are a data analysis agent. Use tools when they materially help. "
                "Never invent tool results. Files may only be read from /home/user/inputs and written under /home/user/outputs. "
                "Use lookup_data for read-only CSV/Parquet SQL, execute_python for analysis, and generate_visualization for chart files. "
                "When a DataFrame is a meaningful intermediate or answer table, save it as CSV or Parquet under /home/user/outputs so it can be persisted and previewed. "
                "When the user asks you to create code, show it in a fenced Markdown code block and also call write_file to save the complete code under /home/user/outputs with the correct extension; the saved file becomes a downloadable Artifact card."
            ),
            thinking_config=types.ThinkingConfig(thinking_level=effort) if effort else None,
        )
        try:
            for step in range(max_steps):
                if is_cancelled is not None and is_cancelled():
                    return
                stream = await self._client.aio.models.generate_content_stream(
                    model=model_id,
                    contents=contents,
                    config=config,
                )
                model_parts: list[types.Part] = []
                calls: list[object] = []
                seen_call_ids: set[str] = set()
                received_content = False
                async for chunk in stream:
                    if is_cancelled is not None and is_cancelled():
                        return
                    if not chunk.candidates or chunk.candidates[0].content is None:
                        continue
                    received_content = True
                    for part in chunk.candidates[0].content.parts or []:
                        if part.function_call is not None:
                            call = part.function_call
                            # Providers may repeat the final function-call part
                            # in streamed chunks. Execute each call only once.
                            call_id = str(call.id or f"step-{step + 1}-call-{len(calls) + 1}")
                            if call_id not in seen_call_ids:
                                seen_call_ids.add(call_id)
                                calls.append(call)
                                model_parts.append(part)
                            continue
                        if part.text:
                            model_parts.append(types.Part.from_text(text=part.text))
                            yield ProviderEvent("message.delta", {"text": part.text})
                if not received_content:
                    raise ProviderError("empty_provider_response", "Gemini returned no response.")
                if not model_parts:
                    raise ProviderError("empty_provider_response", "Gemini returned no response.")
                contents.append(types.Content(role="model", parts=model_parts))
                if not calls:
                    return
                response_parts: list[types.Part] = []
                for index, call in enumerate(calls):
                    if is_cancelled is not None and is_cancelled():
                        return
                    name = str(call.name or "")
                    arguments = dict(call.args or {})
                    tool_call_id = call.id or f"step-{step + 1}-call-{index + 1}"
                    yield ProviderEvent("tool.started", {"tool_call_id": tool_call_id, "name": name, "arguments": arguments})
                    result = await execute_tool(name, arguments)
                    failed = bool(result.get("error")) or result.get("success") is False
                    yield ProviderEvent(
                        "tool.failed" if failed else "tool.completed",
                        {"tool_call_id": tool_call_id, "name": name, "error": result.get("error"), "output": result} if failed else {"tool_call_id": tool_call_id, "name": name, "output": result},
                    )
                    response_parts.append(types.Part.from_function_response(name=name, response=result))
                contents.append(types.Content(role="user", parts=response_parts))
            raise ProviderError("max_tool_steps", "The agent reached the maximum number of tool steps.")
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError("provider_error", "Gemini tool execution failed.") from exc
