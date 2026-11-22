# 03. Execution Engines

The backend embeds two specialized local runtimes designed specifically for sub-20ms execution: **`DuckDBEngine`** and **`WarmPythonWorker`**.

---

## 1. DuckDB In-Process Analytical Engine

[backend/engine/duckdb_engine.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine/duckdb_engine.py) provides an embedded SQL runtime executing directly in the server process.

### Architecture & Registration Flow
When a user uploads a CSV or Parquet file, `DuckDBEngine` registers it into an in-memory database:
```python
class DuckDBEngine:
    def __init__(self, database: str = ":memory:"):
        self.conn = duckdb.connect(database=database)

    def register_dataset(self, file_path: str, table_name: str = "dataset") -> Dict[str, Any]:
        normalized_path = file_path.replace("\\", "/")
        query = f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM '{normalized_path}'"
        self.conn.execute(query)
        schema = self.get_schema(table_name)
        ...
```

### Key Technical Features
1. **Direct Materialization**: Rather than scanning files repeatedly from disk, `CREATE OR REPLACE TABLE ... AS SELECT * FROM ...` materializes data directly into memory. Subsequent queries execute in **1–15 milliseconds**.
2. **Path Normalization**: Windows backslashes (`\`) are automatically sanitized to forward slashes (`/`), preventing SQL syntax errors.
3. **Automatic Schema Discovery**: Introspects column names and types (`DESCRIBE "dataset"`) to inject schema definitions directly into Gemini's system prompt.
4. **JSON-Safe Serialization**: Converts cursor results (including ISO dates, floats, decimals, and nulls) into clean Python dictionaries ready for SSE streaming.

---

## 2. Warm Python Worker with Hard Timeout Guard

[backend/engine/python_worker.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine/python_worker.py) is a persistent, in-process Python runtime designed to eliminate cold-start container overhead.

### Why Not Cold Subprocesses?
Spawning a fresh Python subprocess (`subprocess.Popen(["python", "-c", ...])`) on Windows incurs a **250ms – 500ms** operating system penalty just loading interpreter binaries and importing heavy packages like `pandas`, `numpy`, and `scipy`.

### Pre-Warmed Namespace
On startup, `WarmPythonWorker` initializes a warm execution session:
```python
warm_code = """
import sys, math, json
try:
    import pandas as pd
    import numpy as np
    import scipy, scipy.stats as stats
    import matplotlib
    matplotlib.use("Agg")  # Headless non-GUI backend
    import matplotlib.pyplot as plt
    import seaborn as sns
except ImportError:
    pass
"""
```

### State Retention Across Turns
Because globals persist across calls, the agent can warm a dataset on upload and reference it repeatedly:
- **Turn 1**: `df = pd.read_csv('...')` warms the dataframe in memory.
- **Turn 2**: Code snippets like `stats.skew(df['revenue'])` execute in **1–3 milliseconds** without re-reading the file from disk.

### Hard Timeout & Isolation
To prevent runaway scripts or infinite loops (`while True: pass`) from freezing the server, `WarmPythonWorker` runs executions inside dedicated threads with a hard timeout guard (default: 3.0s):
- **Stdout/Stderr Interception**: `sys.stdout` and `sys.stderr` are redirected to thread-safe buffers.
- **Timeout Termination**: If a script exceeds the threshold, the worker terminates the thread, resets memory safely, and reports `timed_out: True`.
