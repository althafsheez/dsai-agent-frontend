from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import aclosing
import logging
import os
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from google import genai
from google.genai import types

if TYPE_CHECKING:
    from agentic.engine.duckdb_engine import DuckDBEngine
    from agentic.engine.python_worker import WarmPythonWorker

from agentic.agent.prompts import SYSTEM_PROMPT
from agentic.runtime.diagnostics import GEMINI_HTTP_ATTEMPTS, GeminiRequests, diagnostic, gemini_diagnostic

logger = logging.getLogger("agentic.performance")


def _is_transient(exc: Exception) -> bool:
    """Google's 'high demand' (503), rate limit (429) and brief 500s succeed when repeated."""
    return getattr(exc, "code", None) in (429, 500, 502, 503, 504)


async def _response_chunks(stream: AsyncGenerator[Any, None], idle_timeout: float | None) -> AsyncIterator[Any]:
    async with aclosing(stream):
        while True:
            try:
                async with asyncio.timeout(idle_timeout):
                    chunk = await anext(stream)
            except StopAsyncIteration:
                return
            yield chunk


PARALLEL_SAFE_TOOLS = frozenset({"read_file", "list_files", "web_search"})

GEMINI_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="run_duckdb_sql",
                description="Execute an analytical SQL query in DuckDB over the dataset (table 'dataset'). Returns column names, preview rows, and latency.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "The DuckDB SQL query to execute, e.g. 'SELECT count(*), avg(metric) FROM dataset'",
                        }
                    },
                    "required": ["sql"],
                },
            ),
            types.FunctionDeclaration(
                name="run_python_code",
                description="Execute Python code in a persistent warm session (with pandas as pd, numpy as np, scipy, stats, and df loaded). Use print() to output results. Returns stdout/stderr and latency.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The Python code snippet to execute",
                        }
                    },
                    "required": ["code"],
                },
            ),
            types.FunctionDeclaration(
                name="web_search",
                description="Search the web for external information, facts, definitions, or public references.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query string",
                        }
                    },
                    "required": ["query"],
                },
            ),
        ]
    )
]


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
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        max_turns: int = 2,
    ):
        from agentic.config import get_gemini_api_key, get_gemini_model
        from agentic.engine.duckdb_engine import DuckDBEngine
        from agentic.engine.python_worker import WarmPythonWorker

        self.duckdb_engine = duckdb_engine or DuckDBEngine()
        self.python_worker = python_worker or WarmPythonWorker()
        self.max_turns = max_turns
        self.api_key = api_key or get_gemini_api_key()
        self.model = model or get_gemini_model()

    def web_search(self, query: str) -> Dict[str, Any]:
        """Search the web for current factual information using Tavily or Wikipedia summary API."""
        import time, urllib.request, urllib.parse, json
        t0 = time.perf_counter()
        tavily_key = os.getenv("TAVILY_API_KEY") or os.getenv("DSAI_TAVILY_API_KEY")
        if tavily_key:
            try:
                req = urllib.request.Request(
                    "https://api.tavily.com/search",
                    data=json.dumps({"api_key": tavily_key, "query": query, "max_results": 3}).encode(),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode())
                    elapsed = round((time.perf_counter() - t0) * 1000, 2)
                    return {"results": data.get("results", []), "execution_time_ms": elapsed}
            except Exception:
                pass
        try:
            encoded = urllib.parse.quote(query)
            search_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={encoded}&limit=3&namespace=0&format=json"
            req = urllib.request.Request(search_url, headers={"User-Agent": "DSAIAgent/1.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode())
                titles = data[1] if len(data) > 1 else []
                descriptions = data[2] if len(data) > 2 else []
                urls = data[3] if len(data) > 3 else []
                results = [{"title": t, "snippet": d, "url": u} for t, d, u in zip(titles, descriptions, urls)]
                if titles:
                    try:
                        sum_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(titles[0])}"
                        with urllib.request.urlopen(urllib.request.Request(sum_url, headers={"User-Agent": "DSAIAgent/1.0"}), timeout=3) as s_resp:
                            s_data = json.loads(s_resp.read().decode())
                            if "extract" in s_data:
                                results[0]["extract"] = s_data["extract"]
                    except Exception:
                        pass
                elapsed = round((time.perf_counter() - t0) * 1000, 2)
                return {"results": results, "query": query, "execution_time_ms": elapsed}
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {"error": str(e), "results": [], "execution_time_ms": elapsed}

    def execute_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name and return result dictionary."""
        if name == "run_duckdb_sql":
            sql = args.get("sql", "")
            return self.duckdb_engine.run_query(sql)
        elif name == "run_python_code":
            code = args.get("code", "")
            return self.python_worker.execute(code)
        elif name == "web_search":
            query = args.get("query", "")
            return self.web_search(query)
        else:
            return {"error": f"Unknown tool: {name}"}

    async def stream_query(
        self, query: str, dataset_path: Optional[str] = None
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
                "content": "No GEMINI_API_KEY detected in agentic/.env or environment. Running Phase 0 fallback...",
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
                    f"> To enable full autonomous ReAct reasoning with Gemini, set `GEMINI_API_KEY` in `agentic/.env`.\n"
                )
            else:
                md = (
                    "### Phase 0 ReAct Agent Ready\n\n"
                    "DuckDB and Python warm worker engines are initialized and operational.\n\n"
                    "> [!TIP]\n"
                    f"> Add your Gemini API Key into `agentic/.env`:\n"
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

        # 3. ReAct loop with Google GenAI SDK
        client = genai.Client(api_key=self.api_key)
        contents: List[types.Content] = [
            types.Content(role="user", parts=[types.Part.from_text(text=query)])
        ]
        config = types.GenerateContentConfig(
            temperature=0.0,
            tools=GEMINI_TOOLS,
            system_instruction=system_content,
        )

        async def execute(name: str, args: dict) -> dict:
            return self.execute_tool(name, args)

        try:
            async for event in self.stream_turns(
                client=client, model=self.model, contents=contents, config=config,
                max_turns=self.max_turns, execute_tool=execute,
            ):
                if event["type"] == "done":
                    event["metrics"]["total_time_ms"] = round((time.perf_counter() - start_time) * 1000, 2)
                yield event
        finally:
            await client.aio.aclose()

    @staticmethod
    async def stream_turns(
        *, client: genai.Client, model: str, contents: list[types.Content],
        config: types.GenerateContentConfig, max_turns: int,
        execute_tool: Callable[[str, dict], Awaitable[dict]],
        is_cancelled: Callable[[], bool] | None = None,
        fallback_models: tuple[str, ...] = (),
        response_idle_timeout: float | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run tool turns followed by a tool-free synthesis if the budget is exhausted."""
        final_answer = []
        pending_fallbacks = list(fallback_models)
        start = time.perf_counter()
        first_response = True
        for turn in range(1, max_turns + 2):
            if is_cancelled and is_cancelled():
                return
            synthesis = turn > max_turns
            turn_config = config.model_copy(update={
                "tool_config": types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(mode="NONE")
                ),
            }) if synthesis else config
            if synthesis:
                contents.append(types.Content(role="user", parts=[types.Part.from_text(
                    text="The tool budget is exhausted. Give your final answer using the results already available. "
                    "Explain any incomplete work or tool errors. Do not request additional tools."
                )]))
            label = "Synthesizing analytical findings…" if synthesis else f"Analysis turn {turn} of {max_turns}"
            yield {"type": "status", "content": label, "turn": turn}
            model_started = time.perf_counter()
            calls = []
            seen_ids = set()
            model_parts = []
            requests = GeminiRequests()
            attempt = 0
            while True:
                requests_before_attempt = requests.count
                try:
                    stream = requests.stream(client, model=model, contents=contents, config=turn_config)
                    async for chunk in _response_chunks(stream, response_idle_timeout):
                        if first_response:
                            logger.info("gemini_first_response duration_ms=%.1f", (time.perf_counter() - start) * 1000)
                            first_response = False
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
                                if not final_answer:
                                    logger.info("gemini_first_text duration_ms=%.1f", (time.perf_counter() - start) * 1000)
                                final_answer.append(part.text)
                                yield {"type": "delta", "content": part.text}
                    break
                except Exception as exc:
                    stalled = response_idle_timeout is not None and isinstance(exc, TimeoutError)
                    if not model_parts and (_is_transient(exc) or stalled):
                        if stalled and pending_fallbacks and turn == 1:
                            previous, model = model, pending_fallbacks.pop(0)
                            attempt = 0
                            yield {"type": "status", "content": f"No response from {previous}. Trying {model}…", "turn": turn}
                            continue
                        if attempt < 2 and requests.count - requests_before_attempt < GEMINI_HTTP_ATTEMPTS:
                            attempt += 1
                            if response_idle_timeout is not None:
                                yield {"type": "status", "content": f"No usable response from {model}. Retrying analysis turn {turn}…", "turn": turn}
                            for _ in range(20 * attempt):
                                if is_cancelled and is_cancelled():
                                    return
                                await asyncio.sleep(0.1)
                            continue
                        if pending_fallbacks and turn == 1:
                            previous, model = model, pending_fallbacks.pop(0)
                            attempt = 0
                            yield {"type": "status", "content": f"{previous} is busy, switching to {model}…", "turn": turn}
                            continue
                    error = gemini_diagnostic(
                        exc, turn=turn, stage="final_synthesis" if synthesis else "model_generation",
                        duration_ms=round((time.perf_counter() - model_started) * 1000), requests=requests.count,
                    )
                    logger.warning("gemini_generation_failed turn=%d code=%s", turn, error["code"])
                    yield {"type": "error", "content": error["message"], "diagnostic": error}
                    return
            if (synthesis and calls) or (not calls and not any(part.text and not part.thought for part in model_parts)):
                error = diagnostic(
                    "Agent" if synthesis else "Gemini API",
                    "maximum_tool_steps" if synthesis else "gemini_empty_response",
                    "limit" if synthesis else "empty_response",
                    "Maximum tool steps reached" if synthesis else "Gemini returned no public answer",
                    "final_synthesis" if synthesis else "model_generation",
                    turn=turn, duration_ms=round((time.perf_counter() - model_started) * 1000),
                )
                yield {"type": "error", "content": error["message"], "diagnostic": error}
                return
            if not calls:
                break
            contents.append(types.Content(role="model", parts=model_parts))
            responses = []
            prepared_calls = [
                (call, str(call.name or ""), dict(call.args or {}), call.id or f"turn-{turn}-call-{index}")
                for index, call in enumerate(calls, 1)
            ]
            parallel = len(prepared_calls) > 1 and all(name in PARALLEL_SAFE_TOOLS for _, name, _, _ in prepared_calls)
            results = []
            if parallel:
                for _, name, args, call_id in prepared_calls:
                    if is_cancelled and is_cancelled():
                        return
                    yield {"type": "tool_call", "tool": name, "arguments": args, "tool_call_id": call_id, "turn": turn}
                tasks = [asyncio.create_task(execute_tool(name, args)) for _, name, args, _ in prepared_calls]
                try:
                    results = await asyncio.gather(*tasks)
                finally:
                    for task in tasks:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
            for index, (call, name, args, call_id) in enumerate(prepared_calls):
                if parallel:
                    result = results[index]
                else:
                    if is_cancelled and is_cancelled():
                        return
                    yield {"type": "tool_call", "tool": name, "arguments": args, "tool_call_id": call_id, "turn": turn}
                    result = await execute_tool(name, args)
                yield {"type": "tool_result", "tool": name, "result": result, "tool_call_id": call_id, "turn": turn}
                responses.append(types.Part(function_response=types.FunctionResponse(
                    name=name, id=call.id, response=result,
                )))
            contents.append(types.Content(role="user", parts=responses))

        yield {"type": "done", "content": "".join(final_answer), "metrics": {
            "turns": min(turn, max_turns), "total_time_ms": round((time.perf_counter() - start) * 1000, 2),
        }}
