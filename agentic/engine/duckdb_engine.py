import time
from typing import Any, Dict, List, Optional
import duckdb


class DuckDBEngine:
    """
    In-process DuckDB query engine for low-latency analytical queries
    over Parquet, CSV, and registered in-memory tables.
    """

    def __init__(self, database: str = ":memory:"):
        self.conn = duckdb.connect(database=database)

    def register_dataset(self, file_path: str, table_name: str = "dataset") -> Dict[str, Any]:
        """
        Register a local file (CSV, Parquet, JSON) as a view in DuckDB.
        Path slashes are normalized for cross-platform compatibility.
        """
        start = time.perf_counter()
        normalized_path = file_path.replace("\\", "/")
        try:
            # Materialize directly into in-memory table for sub-5ms analytical execution
            query = f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM '{normalized_path}'"
            self.conn.execute(query)
            elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
            schema = self.get_schema(table_name)
            return {
                "table_name": table_name,
                "file_path": file_path,
                "schema": schema,
                "execution_time_ms": elapsed_ms,
                "error": None
            }
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
            return {
                "table_name": table_name,
                "file_path": file_path,
                "schema": [],
                "execution_time_ms": elapsed_ms,
                "error": str(e)
            }

    def get_schema(self, table_name: str = "dataset") -> List[Dict[str, str]]:
        """
        Retrieve column names and data types for a registered table or view.
        """
        try:
            cursor = self.conn.execute(f"DESCRIBE \"{table_name}\"")
            cols = cursor.fetchall()
            return [{"column_name": row[0], "column_type": str(row[1])} for row in cols]
        except Exception:
            return []

    def run_query(self, sql: str, max_preview_rows: int = 50) -> Dict[str, Any]:
        """
        Executes a SQL query against the in-process DuckDB database.
        Returns row preview (as JSON-serializable dicts) and execution time in ms.
        """
        start = time.perf_counter()
        try:
            cursor = self.conn.cursor()
            res = cursor.execute(sql)
            
            description = cursor.description
            if description is None:
                # DDL or non-returning statement
                elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
                return {
                    "columns": [],
                    "rows": [],
                    "row_count": 0,
                    "execution_time_ms": elapsed_ms,
                    "error": None
                }

            columns = [desc[0] for desc in description]
            fetched = res.fetchmany(max_preview_rows)
            
            # Serialize values to JSON-friendly primitives
            serialized_rows = []
            for row in fetched:
                row_dict = {}
                for col_name, val in zip(columns, row):
                    if hasattr(val, "isoformat"):
                        row_dict[col_name] = val.isoformat()
                    elif isinstance(val, (int, float, str, bool)) or val is None:
                        row_dict[col_name] = val
                    else:
                        row_dict[col_name] = str(val)
                serialized_rows.append(row_dict)

            elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
            return {
                "columns": columns,
                "rows": serialized_rows,
                "row_count": len(serialized_rows),
                "execution_time_ms": elapsed_ms,
                "error": None
            }
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
            return {
                "columns": [],
                "rows": [],
                "row_count": 0,
                "execution_time_ms": elapsed_ms,
                "error": str(e)
            }

    def close(self):
        """Close connection to DuckDB."""
        try:
            self.conn.close()
        except Exception:
            pass
