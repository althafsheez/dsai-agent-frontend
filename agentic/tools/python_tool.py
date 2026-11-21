from __future__ import annotations
from typing import Any, Dict, Optional
from agentic.tools.base import BaseTool
from agentic.engine.python_worker import WarmPythonWorker


class PythonCodeTool(BaseTool):
    """
    In-process warm Python execution session tool.
    Executes advanced statistical calculations (scipy.stats, numpy, pandas) in warm state.
    """

    def __init__(self, python_worker: Optional[WarmPythonWorker] = None):
        self.python_worker = python_worker or WarmPythonWorker()

    @property
    def name(self) -> str:
        return "run_python_code"

    @property
    def description(self) -> str:
        return (
            "Execute Python code in a persistent warm session (with pandas as pd, numpy as np, "
            "scipy, stats, and df loaded). Use print() to output results. Returns stdout/stderr and latency."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The Python code snippet to execute",
                }
            },
            "required": ["code"],
        }

    def execute(self, code: str = "", **kwargs: Any) -> Dict[str, Any]:
        return self.python_worker.execute(code)
