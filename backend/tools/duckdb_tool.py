from __future__ import annotations
from typing import Any, Dict, Optional
from backend.tools.base import BaseTool
from backend.engine.duckdb_engine import DuckDBEngine


class DuckDBSQLTool(BaseTool):
    """
    In-process analytical SQL tool powered by DuckDB.
    Executes aggregation, filtering, group-by, and percentiles in milliseconds.
    """

    def __init__(self, duckdb_engine: Optional[DuckDBEngine] = None):
        self.duckdb_engine = duckdb_engine or DuckDBEngine()

    @property
    def name(self) -> str:
        return "run_duckdb_sql"

    @property
    def description(self) -> str:
        return (
            "Execute an analytical SQL query in DuckDB over the dataset (table 'dataset'). "
            "Returns column names, preview rows, and latency."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The DuckDB SQL query to execute, e.g. 'SELECT count(*), avg(metric) FROM dataset'",
                }
            },
            "required": ["sql"],
        }

    def execute(self, sql: str = "", **kwargs: Any) -> Dict[str, Any]:
        return self.duckdb_engine.run_query(sql)
