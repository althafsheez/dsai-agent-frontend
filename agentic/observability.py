import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

JSONL_LOG_PATH = os.path.join(LOGS_DIR, "chat_traces.jsonl")
HUMAN_LOG_PATH = os.path.join(LOGS_DIR, "chat_traces.log")

_log_lock = threading.Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunTracker:
    """
    High-fidelity tracker for a single agentic run.
    Records granular timing: Time-to-First-Token (TTFT), individual tool latencies,
    model synthesis time, and total end-to-end response time.
    Persists human-readable and machine-readable audit logs.
    """

    def __init__(
        self,
        run_id: str,
        chat_id: str,
        user_query: str,
        model: str,
        dataset_path: Optional[str] = None,
    ):
        self.run_id = run_id
        self.chat_id = chat_id
        self.user_query = user_query
        self.model = model
        self.dataset_path = dataset_path

        self.t_start = time.perf_counter()
        self.start_timestamp = utc_now()
        self.t_first_token: Optional[float] = None
        self.ttft_ms: Optional[int] = None

        self.active_tools: Dict[str, Dict[str, Any]] = {}
        self.completed_tools: List[Dict[str, Any]] = []
        self.turn_count = 0
        self.final_response = ""
        self.status = "running"
        self.error_detail: Optional[str] = None

    def record_first_token(self) -> None:
        if self.t_first_token is None:
            self.t_first_token = time.perf_counter()
            self.ttft_ms = max(1, round((self.t_first_token - self.t_start) * 1000))

    def start_tool(self, tool_name: str, call_id: str, step_id: str, arguments: Dict[str, Any]) -> None:
        self.active_tools[tool_name] = {
            "name": tool_name,
            "call_id": call_id,
            "step_id": step_id,
            "arguments": arguments,
            "t0": time.perf_counter(),
            "timestamp": utc_now(),
        }

    def end_tool(self, tool_name: str, output: Any, error: Optional[str] = None) -> Dict[str, Any]:
        info = self.active_tools.pop(tool_name, None)
        t_end = time.perf_counter()
        if info:
            duration_ms = max(1, round((t_end - info["t0"]) * 1000))
            record = {
                "name": tool_name,
                "call_id": info["call_id"],
                "step_id": info["step_id"],
                "arguments": info["arguments"],
                "duration_ms": duration_ms,
                "output": output,
                "error": error,
                "timestamp": info["timestamp"],
            }
        else:
            duration_ms = 10
            record = {
                "name": tool_name,
                "call_id": f"call-{len(self.completed_tools) + 1}",
                "step_id": f"step-{len(self.completed_tools) + 1}",
                "arguments": {},
                "duration_ms": duration_ms,
                "output": output,
                "error": error,
                "timestamp": utc_now(),
            }
        self.completed_tools.append(record)
        return record

    def finish(
        self,
        final_response: str,
        status: str = "completed",
        turn_count: int = 1,
        error_detail: Optional[str] = None,
    ) -> Dict[str, Any]:
        t_finish = time.perf_counter()
        total_time_ms = max(1, round((t_finish - self.t_start) * 1000))
        tool_time_ms = sum(t["duration_ms"] for t in self.completed_tools)
        llm_time_ms = max(0, total_time_ms - tool_time_ms)

        self.final_response = final_response
        self.status = status
        self.turn_count = turn_count
        self.error_detail = error_detail

        metrics = {
            "total_response_time_ms": total_time_ms,
            "ttft_ms": self.ttft_ms or total_time_ms,
            "tool_execution_time_ms": tool_time_ms,
            "llm_time_ms": llm_time_ms,
            "turn_count": turn_count,
            "tool_calls_count": len(self.completed_tools),
        }

        trace_record = {
            "run_id": self.run_id,
            "chat_id": self.chat_id,
            "timestamp": self.start_timestamp,
            "finished_at": utc_now(),
            "status": self.status,
            "model": self.model,
            "dataset_path": self.dataset_path,
            "user_query": self.user_query,
            "metrics": metrics,
            "tools": self.completed_tools,
            "final_response": self.final_response,
            "error_detail": self.error_detail,
        }

        # Persist to disk
        self._write_logs(trace_record)
        return trace_record

    def _write_logs(self, record: Dict[str, Any]) -> None:
        metrics = record["metrics"]
        total_ms = metrics["total_response_time_ms"]
        ttft_ms = metrics["ttft_ms"]
        tool_ms = metrics["tool_execution_time_ms"]
        llm_ms = metrics["llm_time_ms"]

        # 1. Machine-readable JSONL
        with _log_lock:
            try:
                with open(JSONL_LOG_PATH, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record, default=str) + "\n")
            except Exception:
                pass

            # 2. Human-readable text audit log
            try:
                divider = "=" * 80
                sub_divider = "-" * 80
                lines = [
                    divider,
                    f"[{record['timestamp']}] RUN: {record['run_id']} | CHAT: {record['chat_id']}",
                    f"MODEL: {record['model']} | STATUS: {record['status'].upper()}",
                    f"TOTAL RESPONSE TIME: {total_ms:,} ms | TTFT: {ttft_ms:,} ms | TOOLS: {tool_ms:,} ms ({len(record['tools'])} calls) | LLM: {llm_ms:,} ms",
                    sub_divider,
                    f"[USER QUERY]:\n{record['user_query'].strip()}",
                ]

                if record["dataset_path"]:
                    lines.append(f"[DATASET ATTACHED]: {record['dataset_path']}")

                for i, tool in enumerate(record["tools"], 1):
                    lines.append(f"\n[TOOL CALL {i}]: {tool['name']} (Duration: {tool['duration_ms']} ms)")
                    if tool.get("arguments"):
                        args_str = json.dumps(tool["arguments"], indent=2)
                        lines.append(f"  Arguments:\n{args_str}")
                    if tool.get("output"):
                        out_val = tool["output"]
                        if isinstance(out_val, dict):
                            if out_val.get("stdout"):
                                lines.append(f"  Stdout:\n    {out_val['stdout'].strip()}")
                            if out_val.get("rows"):
                                lines.append(f"  Rows preview ({len(out_val['rows'])} rows):\n    {out_val['rows'][:3]}")
                        else:
                            lines.append(f"  Output:\n    {str(out_val)[:300]}")
                    if tool.get("error"):
                        lines.append(f"  Error: {tool['error']}")

                lines.append(f"\n[ASSISTANT RESPONSE]:\n{record['final_response'].strip()[:800]}")
                if len(record["final_response"]) > 800:
                    lines.append("... (truncated in summary log; see JSONL for full response)")
                lines.append(divider + "\n")

                with open(HUMAN_LOG_PATH, "a", encoding="utf-8") as f:
                    f.write("\n".join(lines) + "\n")
            except Exception:
                pass


def get_recent_traces(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent traces from JSONL file in reverse chronological order."""
    if not os.path.exists(JSONL_LOG_PATH):
        return []
    records = []
    with _log_lock:
        try:
            with open(JSONL_LOG_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            records.append(json.loads(line))
                        except Exception:
                            continue
        except Exception:
            return []
    return list(reversed(records))[:limit]


def get_trace_by_run_id(run_id: str) -> Optional[Dict[str, Any]]:
    """Find a specific run trace by run_id."""
    for trace in get_recent_traces(limit=200):
        if trace.get("run_id") == run_id:
            return trace
    return None
