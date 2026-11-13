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
        poll_steering: Callable[[str], list[str]] | None = None,
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
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            system_instruction=(
                "You are a data analysis agent. Inspect the provided file paths and actual columns before analysis. "
                "Use execute_python for calculations and analysis, lookup_data for read-only CSV/Parquet SQL, "
                "and generate_visualization for charts. Python variables persist across tool calls in this run. "
                "Read inputs from /home/user/inputs and generated files from /home/user/outputs. "
                "Save charts and downloadable tables under /home/user/outputs. "
                "Use stdout and text results as evidence. Correct tool errors when possible; never invent results "
                "or claim that a failed tool succeeded. Incorporate steering instructions into the remaining work."
            ),
            thinking_config=types.ThinkingConfig(thinking_level=effort) if effort else None,
        )
        def pending_steering(checkpoint: str) -> list[str]:
            return poll_steering(checkpoint) if poll_steering is not None else []

        def apply_steering(instructions: list[str]) -> ProviderEvent:
            contents.append(types.Content(role="user", parts=[types.Part.from_text(
                text="High-priority steering instruction: " + "\n".join(instructions)
            )]))
            return ProviderEvent("progress", {"label": "Direction updated", "detail": "Continuing with your steering instruction."})

        for step in range(max_steps):
            if is_cancelled is not None and is_cancelled():
                return
            instructions = pending_steering("before.model")
            if instructions:
                yield apply_steering(instructions)
            if is_cancelled is not None and is_cancelled():
                return
            # Only SDK failures become provider errors. Runner control signals
            # and tool errors must not be disguised as Gemini transport errors.
            try:
                response = await self._client.aio.models.generate_content(model=model_id, contents=contents, config=config)
            except Exception as exc:
                raise ProviderError("provider_error", "Gemini generation failed.") from exc
            if is_cancelled is not None and is_cancelled():
                return
            if not response.candidates or response.candidates[0].content is None:
                raise ProviderError("empty_provider_response", "Gemini returned no response.")
            model_content = response.candidates[0].content
            # Keep complete original Parts, including Gemini thought signatures.
            contents.append(model_content)
            calls = [part.function_call for part in (model_content.parts or []) if part.function_call is not None]
            if not calls:
                instructions = pending_steering("before.final")
                if instructions:
                    yield apply_steering(instructions)
                    continue
                text = response.text or ""
                if text:
                    yield ProviderEvent("message.delta", {"text": text})
                return

            response_parts: list[types.Part] = []
            instructions = []
            for index, call in enumerate(calls):
                if is_cancelled is not None and is_cancelled():
                    return
                instructions.extend(pending_steering("before.tool"))
                name = str(call.name or "")
                arguments = dict(call.args or {})
                tool_call_id = call.id or f"step-{step + 1}-call-{index + 1}"
                if not instructions:
                    yield ProviderEvent("tool.started", {"tool_call_id": tool_call_id, "name": name, "arguments": arguments})
                    if is_cancelled is not None and is_cancelled():
                        return
                    instructions.extend(pending_steering("before.tool"))
                if instructions:
                    # Complete every pending function response before appending
                    # a new user turn; do not execute work from the superseded plan.
                    result = {"success": False, "error": "Tool skipped because the user changed the analysis direction.", "skipped": True}
                else:
                    result = await execute_tool(name, arguments)
                response_parts.append(types.Part(function_response=types.FunctionResponse(
                    id=call.id, name=name, response=result,
                )))
                failed = bool(result.get("error")) or result.get("success") is False
                event_data = {"tool_call_id": tool_call_id, "name": name, "output": result}
                if failed:
                    event_data["error"] = result.get("error")
                yield ProviderEvent("tool.failed" if failed else "tool.completed", event_data)
                instructions.extend(pending_steering("after.tool"))
            contents.append(types.Content(role="user", parts=response_parts))
            if instructions:
                yield apply_steering(instructions)
        raise ProviderError("max_tool_steps", "The agent reached the maximum number of tool steps.")
