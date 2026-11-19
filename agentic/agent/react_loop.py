import json
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from google import genai
from google.genai import types

from agentic.config import get_gemini_api_key, get_gemini_model
from agentic.engine.duckdb_engine import DuckDBEngine
from agentic.engine.python_worker import WarmPythonWorker
from agentic.agent.prompts import SYSTEM_PROMPT


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

        turn = 0
        final_answer = ""

        while turn < self.max_turns:
            turn += 1
            yield {"type": "status", "content": f"Turn {turn}/{self.max_turns}: Gemini reasoning ({self.model})..."}

            try:
                stream = await client.aio.models.generate_content_stream(
                    model=self.model,
                    contents=contents,
                    config=config,
                )
            except Exception as e:
                yield {"type": "error", "content": f"Gemini API error: {str(e)}"}
                return

            model_parts: List[types.Part] = []
            calls: List[Any] = []
            seen_call_ids: set = set()

            try:
                async for chunk in stream:
                    if not chunk.candidates or chunk.candidates[0].content is None:
                        continue
                    for part in chunk.candidates[0].content.parts or []:
                        if part.function_call is not None:
                            call = part.function_call
                            call_id = str(call.id or f"turn-{turn}-call-{len(calls) + 1}")
                            if call_id not in seen_call_ids:
                                seen_call_ids.add(call_id)
                                calls.append(call)
                                model_parts.append(part)
                            continue
                        if part.text:
                            model_parts.append(types.Part.from_text(text=part.text))
                            final_answer += part.text
                            yield {"type": "delta", "content": part.text}
            except Exception as e:
                yield {"type": "error", "content": f"Stream error: {str(e)}"}
                return

            if not calls:
                # No tool calls needed, model completed final answer directly
                break

            # Record model turn with function calls
            contents.append(types.Content(role="model", parts=model_parts))

            # Execute all requested tool calls
            response_parts: List[types.Part] = []
            for call in calls:
                fn_name = str(call.name or "")
                fn_args = dict(call.args or {})

                yield {
                    "type": "tool_call",
                    "tool": fn_name,
                    "arguments": fn_args,
                }

                tool_result = self.execute_tool(fn_name, fn_args)
                yield {
                    "type": "tool_result",
                    "tool": fn_name,
                    "result": tool_result,
                }

                response_parts.append(
                    types.Part.from_function_response(name=fn_name, response={"result": tool_result})
                )

            contents.append(types.Content(role="user", parts=response_parts))

            # If max turns reached, make one last synthesis call without tools
            if turn == self.max_turns:
                yield {
                    "type": "status",
                    "content": "Final turn: Synthesizing analytical findings...",
                }
                synth_config = types.GenerateContentConfig(
                    temperature=0.0,
                    system_instruction=system_content,
                )
                try:
                    stream_synth = await client.aio.models.generate_content_stream(
                        model=self.model,
                        contents=contents,
                        config=synth_config,
                    )
                    async for chunk in stream_synth:
                        if chunk.text:
                            final_answer += chunk.text
                            yield {"type": "delta", "content": chunk.text}
                except Exception as e:
                    yield {"type": "error", "content": f"Final formatting error: {str(e)}"}
                break

        total_elapsed = round((time.perf_counter() - start_time) * 1000, 2)
        yield {
            "type": "done",
            "content": final_answer,
            "metrics": {
                "total_time_ms": total_elapsed,
                "turns": turn,
            },
        }
