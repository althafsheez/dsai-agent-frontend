from __future__ import annotations

from collections.abc import Awaitable, Callable
import asyncio
import os
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from google import genai
from google.genai import types

if TYPE_CHECKING:
    from backend.engine.duckdb_engine import DuckDBEngine
    from backend.engine.python_worker import WarmPythonWorker

from backend.agent.math_sanitizer import sanitize_math_text
from backend.agent.prompts import SYSTEM_PROMPT
from backend.client import get_shared_client
from backend.tools import ToolRegistry, create_default_registry

# Backward-compatibility export for default tool declarations
GEMINI_TOOLS = create_default_registry().get_gemini_tools()


class ReActAgent:
    """
    Single-agent ReAct loop powered by Google Gemini targeting sub-5 second latency.
    Operates within a 2-turn maximum budget:
    Turn 1: Tool execution (SQL first, Python for stats)
    Turn 2: Recovery / Synthesis / Formatting (Plotly JSON emitted inline in Markdown)
    """

    def __init__(
        self,
        duckdb_engine: Optional[DuckDBEngine] = None,
        python_worker: Optional[WarmPythonWorker] = None,
        tool_registry: Optional[ToolRegistry] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        max_turns: int = 2,
    ):
        from backend.config import get_gemini_api_key, get_gemini_model
        from backend.engine.duckdb_engine import DuckDBEngine
        from backend.engine.python_worker import WarmPythonWorker

        self.duckdb_engine = duckdb_engine or DuckDBEngine()
        self.python_worker = python_worker or WarmPythonWorker()
        self.tool_registry = tool_registry or create_default_registry(
            duckdb_engine=self.duckdb_engine,
            python_worker=self.python_worker,
        )
        self.max_turns = max_turns
        self.api_key = api_key or get_gemini_api_key()
        self.model = model or get_gemini_model()

    def web_search(self, query: str) -> Dict[str, Any]:
        """Search the web for current factual information via WebSearchTool."""
        return self.tool_registry.execute("web_search", {"query": query})

    def execute_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name via the central ToolRegistry."""
        return self.tool_registry.execute(name, args)

    async def stream_query(
        self,
        query: str,
        dataset_path: Optional[str] = None,
        tracker: Optional[Any] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream the ReAct execution loop as SSE-friendly event dictionaries.
        """
        start_time = time.perf_counter()
        schema_info: List[Dict[str, str]] = []

        # 1. Register dataset if provided
        if dataset_path and os.path.exists(dataset_path):
            yield {"type": "status", "content": f"Registering dataset: {dataset_path}"}
            reg_res = self.duckdb_engine.register_dataset(dataset_path, "dataset")
            schema_info = reg_res.get("schema", [])
            yield {
                "type": "status",
                "content": f"DuckDB table 'dataset' ready in {reg_res.get('execution_time_ms', 0)}ms",
            }

            # Pre-load into warm python worker as `df`
            norm_path = dataset_path.replace("\\", "/")
            if norm_path.endswith(".parquet"):
                load_code = f"df = pd.read_parquet(r'{norm_path}')"
            else:
                load_code = f"df = pd.read_csv(r'{norm_path}')"
            py_res = self.python_worker.execute(load_code)
            yield {
                "type": "status",
                "content": f"Python 'df' dataframe warmed in {py_res.get('execution_time_ms', 0)}ms",
            }

        # Format system prompt with dataset context if available
        system_content = SYSTEM_PROMPT
        if schema_info:
            cols_str = ", ".join([f"{c['column_name']} ({c['column_type']})" for c in schema_info])
            system_content += f"\n\nActive Dataset Schema (table 'dataset' / dataframe 'df'):\nColumns: {cols_str}\n"

        # 2. Check if Gemini API key is present
        if not self.api_key:
            yield {
                "type": "status",
                "content": "No GEMINI_API_KEY detected in backend/.env or environment. Running Phase 0 fallback...",
            }
            if schema_info:
                preview = self.duckdb_engine.run_query("SELECT * FROM dataset LIMIT 5")
                cnt = self.duckdb_engine.run_query("SELECT count(*) as total_rows FROM dataset")
                total = cnt.get("rows", [{}])[0].get("total_rows", "unknown")
                md = (
                    f"### Dataset Preview (Phase 0 Fallback Mode)\n\n"
                    f"- **Total Rows**: {total}\n"
                    f"- **DuckDB Query Time**: {preview.get('execution_time_ms', 0)}ms\n\n"
                    f"> [!TIP]\n"
                    f"> To enable full autonomous ReAct reasoning with Gemini, set `GEMINI_API_KEY` in `backend/.env`.\n"
                )
            else:
                md = (
                    "### Phase 0 ReAct Agent Ready\n\n"
                    "DuckDB and Python warm worker engines are initialized and operational.\n\n"
                    "> [!TIP]\n"
                    f"> Add your Gemini API Key into `backend/.env`:\n"
                    f"> ```env\n"
                    f"> GEMINI_API_KEY=your_key_here\n"
                    f"> ```\n"
                )
            elapsed = round((time.perf_counter() - start_time) * 1000, 2)
            yield {"type": "delta", "content": md}
            yield {
                "type": "done",
                "content": md,
                "metrics": {"total_time_ms": elapsed, "turns": 0},
            }
            return

        # 3. ReAct loop with Google GenAI SDK (reusing connection pool)
        client = get_shared_client(self.api_key)
        contents: List[types.Content] = [
            types.Content(role="user", parts=[types.Part.from_text(text=query)])
        ]
        config = types.GenerateContentConfig(
            temperature=0.0,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            max_output_tokens=1024,
            tools=self.tool_registry.get_gemini_tools(),
            system_instruction=system_content,
        )

        async def execute(name: str, args: dict) -> dict:
            return self.execute_tool(name, args)

        async for event in self.stream_turns(
            client=client, model=self.model, contents=contents, config=config,
            max_turns=self.max_turns, execute_tool=execute, tracker=tracker,
        ):
            if event["type"] == "done":
                event["metrics"]["total_time_ms"] = round((time.perf_counter() - start_time) * 1000, 2)
            yield event

    @staticmethod
    async def stream_turns(
        *, client: genai.Client, model: str, contents: list[types.Content],
        config: types.GenerateContentConfig, max_turns: int,
        execute_tool: Callable[[str, dict], Awaitable[dict]],
        is_cancelled: Callable[[], bool] | None = None,
        tracker: Optional[Any] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run tool turns followed by a tool-free synthesis if the budget is exhausted."""
        final_answer = []
        start = time.perf_counter()
        for turn in range(1, max_turns + 1):
            if is_cancelled and is_cancelled():
                return
            # Turn 2 is synthesis if a tool was executed in Turn 1
            synthesis = (turn == max_turns and len(contents) > 1)
            if synthesis:
                turn_config = types.GenerateContentConfig(
                    temperature=0.0,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                    max_output_tokens=1024,
                    tools=None,
                    system_instruction=config.system_instruction,
                )
            else:
                turn_config = config
            label = "Synthesizing analytical findings…" if synthesis else f"Analysis turn {turn} of {max_turns}"
            yield {"type": "status", "content": label}

            gen_name = f"gemini_turn_{turn}"
            if tracker and hasattr(tracker, "start_generation"):
                prompt_input = [
                    {"role": c.role, "parts": [getattr(p, "text", "") or str(p) for p in (c.parts or [])]}
                    for c in contents
                ]
                tracker.start_generation(gen_name, input_data=prompt_input, model=model)

            calls = []
            seen_ids = set()
            model_parts = []
            max_retries = 2
            success = False
            last_err = None
            for attempt in range(max_retries):
                try:
                    stream = await client.aio.models.generate_content_stream(
                        model=model, contents=contents, config=turn_config,
                    )
                    async for chunk in stream:
                        if is_cancelled and is_cancelled():
                            return
                        if not chunk.candidates or not chunk.candidates[0].content:
                            continue
                        for part in chunk.candidates[0].content.parts or []:
                            call = part.function_call
                            if call is not None:
                                if call.id and call.id in seen_ids:
                                    continue
                                if call.id:
                                    seen_ids.add(call.id)
                                calls.append(call)
                            model_parts.append(part)
                            if part.text and not part.thought:
                                final_answer.append(part.text)
                                yield {"type": "delta", "content": part.text}
                    success = True
                    break
                except Exception as exc:
                    last_err = exc
                    if attempt < max_retries - 1:
                        await asyncio.sleep(0.5)
                        continue

            if tracker and hasattr(tracker, "end_generation"):
                gen_text = "".join(part.text for part in model_parts if part.text and not part.thought)
                output_summary = {
                    "text": gen_text,
                    "tool_calls": [c.name for c in calls],
                }
                tracker.end_generation(gen_name, output_data=output_summary)

            if not success:
                yield {"type": "error", "content": f"Gemini generation failed: {type(last_err).__name__}: {str(last_err)}"}
                return
            if not calls:
                if not any(part.text and not part.thought for part in model_parts):
                    yield {"type": "error", "content": "Gemini returned no public answer."}
                    return
                break
            if synthesis:
                yield {"type": "error", "content": "Gemini requested another tool during final synthesis."}
                return
            contents.append(types.Content(role="model", parts=model_parts))
            responses = []
            for index, call in enumerate(calls, 1):
                if is_cancelled and is_cancelled():
                    return
                name = str(call.name or "")
                args = dict(call.args or {})
                call_id = call.id or f"turn-{turn}-call-{index}"
                yield {"type": "tool_call", "tool": name, "arguments": args, "tool_call_id": call_id}
                result = await execute_tool(name, args)
                yield {"type": "tool_result", "tool": name, "result": result, "tool_call_id": call_id}
                responses.append(types.Part(function_response=types.FunctionResponse(
                    name=name, id=call.id, response=result,
                )))
            contents.append(types.Content(role="user", parts=responses))

        final_content = sanitize_math_text("".join(final_answer))
        yield {"type": "done", "content": final_content, "metrics": {
            "turns": min(turn, max_turns), "total_time_ms": round((time.perf_counter() - start) * 1000, 2),
        }}
