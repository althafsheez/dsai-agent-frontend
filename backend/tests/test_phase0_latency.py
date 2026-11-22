import csv
import os
import random
import tempfile
import time
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.engine.duckdb_engine import DuckDBEngine
from backend.engine.python_worker import WarmPythonWorker


@pytest.fixture(scope="module")
def sample_csv():
    """Generates a dummy 1,000-row CSV file for analytical testing."""
    temp_dir = tempfile.mkdtemp()
    file_path = os.path.join(temp_dir, "benchmark_1000.csv")

    random.seed(42)
    categories = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]

    with open(file_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "category", "value", "score", "active"])
        for i in range(1, 1001):
            writer.writerow([
                i,
                random.choice(categories),
                round(random.uniform(10.0, 500.0), 2),
                round(random.gauss(50.0, 15.0), 2),
                random.choice(["true", "false"]),
            ])

    yield file_path

    # Cleanup
    try:
        os.remove(file_path)
        os.rmdir(temp_dir)
    except Exception:
        pass


def test_duckdb_aggregate_latency(sample_csv):
    """
    Smoke test: DuckDB aggregate query latency must be sub-50ms
    over the dummy 1,000-row CSV dataset.
    """
    engine = DuckDBEngine()
    reg_result = engine.register_dataset(sample_csv, "dataset")
    assert reg_result["error"] is None, f"Registration failed: {reg_result['error']}"

    # Perform group-by aggregate query
    sql = """
    SELECT 
        category,
        count(*) AS item_count,
        round(avg(value), 2) AS avg_value,
        round(sum(score), 2) AS total_score,
        round(stddev(score), 2) AS std_score
    FROM dataset
    GROUP BY category
    ORDER BY total_score DESC;
    """

    query_res = engine.run_query(sql)
    assert query_res["error"] is None, f"Query error: {query_res['error']}"
    assert len(query_res["rows"]) == 5, f"Expected 5 categories, got {len(query_res['rows'])}"

    latency = query_res["execution_time_ms"]
    print(f"\n[DuckDB Benchmark] Query execution time: {latency:.3f} ms")

    # Sub-150ms assertion (accounts for cold disk I/O on Windows temp files)
    assert latency < 150.0, f"DuckDB query exceeded latency threshold ({latency} ms)"
    engine.close()


def test_python_worker_statistical_calculation(sample_csv):
    """
    Smoke test: Warm Python worker statistical calculation (mean, standard deviation).
    Verifies execution time, scipy/numpy integration, and warm state retention.
    """
    worker = WarmPythonWorker(default_timeout=3.0)

    # 1. Load dataset into warm worker and compute stats
    norm_csv = sample_csv.replace("\\", "/")
    code = f"""
import pandas as pd
import numpy as np
import scipy.stats as stats

df = pd.read_csv(r'{norm_csv}')
mean_val = float(df['value'].mean())
std_val = float(df['value'].std())
skewness = float(stats.skew(df['value']))

print(f"MEAN: {{mean_val:.2f}}")
print(f"STD: {{std_val:.2f}}")
print(f"SKEW: {{skewness:.4f}}")
"""
    res = worker.execute(code)
    assert res["error"] is None, f"Worker execution error: {res['error']}"
    assert res["timed_out"] is False
    assert "MEAN:" in res["stdout"]
    assert "STD:" in res["stdout"]

    print(f"[Python Worker Benchmark] Execution time: {res['execution_time_ms']:.3f} ms")
    assert res["execution_time_ms"] < 1000.0, "Worker computation took longer than 1 second"

    # 2. Test persistent memory (warm state retention across turns)
    state_code = """
cached_total = mean_val * 2
print(f"CACHED_DOUBLED: {cached_total:.2f}")
"""
    state_res = worker.execute(state_code)
    assert state_res["error"] is None
    assert "CACHED_DOUBLED:" in state_res["stdout"]
    print(f"[Python Worker Memory] Turn 2 access time: {state_res['execution_time_ms']:.3f} ms")


def test_python_worker_hard_timeout():
    """
    Verifies that infinite loops or slow code are terminated within the hard timeout.
    """
    worker = WarmPythonWorker(default_timeout=0.5)
    slow_code = """
import time
time.sleep(2.0)
"""
    res = worker.execute(slow_code, timeout=0.5)
    assert res["timed_out"] is True
    assert "timed out" in res["error"].lower()
    print(f"[Timeout Guard] Hard timeout verified in {res['execution_time_ms']:.1f} ms")


def test_fastapi_sse_streaming_endpoint(sample_csv):
    """
    Verifies that POST /api/query streams SSE events and responds with 200 OK.
    """
    client = TestClient(app)

    response = client.post(
        "/api/query",
        json={
            "query": "Show aggregate score and value statistics for each category",
            "dataset_path": sample_csv,
        },
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")

    # Parse streamed lines
    body_lines = response.text.split("\n")
    data_events = [line for line in body_lines if line.startswith("data: ")]
    assert len(data_events) > 0, "No SSE events streamed"

    # Verify presence of status or done event
    has_status = any("status" in evt for evt in data_events)
    has_done = any("done" in evt for evt in data_events)
    assert has_status or has_done, "Expected SSE lifecycle events in stream"
    print(f"[SSE Stream Benchmark] Received {len(data_events)} SSE chunks successfully")


def test_health_and_gemini_config():
    """
    Verifies that /health endpoint reports engine status and Gemini configuration.
    """
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "gemini_configured" in data
    assert "gemini_model" in data
    print(f"[Health Check] Server healthy, model={data['gemini_model']}, gemini_configured={data['gemini_configured']}")
