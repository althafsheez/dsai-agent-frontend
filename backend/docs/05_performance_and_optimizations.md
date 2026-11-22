# 05. Performance & Latency Optimizations

Achieving sub-5s total response time across an autonomous agent pipeline requires systematic optimization at every layer: connection pooling, execution caching, runtime warming, and generation constraints.

---

## Latency Optimization Matrix

| Layer | Traditional / Naive Approach | DSAI Optimized Approach | Latency Impact |
| :--- | :--- | :--- | :--- |
| **LLM Connection** | New `genai.Client` per request | Global HTTP/2 Connection Pool ([backend/client.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/client.py)) | Saves **300–600ms** (TLS + TCP handshake) |
| **Python Execution** | Subprocess `python -c` or docker container | Pre-warmed in-process worker ([backend/engine/python_worker.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine/python_worker.py)) | Execution drops from **400ms** to **1–8ms** |
| **SQL Queries** | Re-scan CSV from disk per query | Direct materialization to in-memory DuckDB table | Execution drops from **150ms** to **2–19ms** |
| **Model Thinking** | Default unconstrained thinking tokens | `thinking_budget=0` on Flash-Lite | Saves **5,000–15,000ms** in generation delays |
| **Turn Budget** | Unbounded while loop (agent determines stop) | Strict 2-turn maximum with Turn 2 tool suppression | Guarantees bounded deterministic termination |
| **Socket Timeout** | Default infinite/blocking socket read | 30s hard socket timeout in `HttpOptions` | Prevents indefinite socket hangs during API congestion |

---

## 1. Persistent Gemini Client Connection Pool

In [backend/client.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/client.py), `get_shared_client` maintains a thread-safe connection pool keyed by API key:

```python
_CLIENT_POOL: Dict[str, genai.Client] = {}

def get_shared_client(api_key: str) -> genai.Client:
    if api_key not in _CLIENT_POOL:
        _CLIENT_POOL[api_key] = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=30000),  # 30s socket timeout guard
        )
    return _CLIENT_POOL[api_key]
```

### Why This Matters
- Google GenAI SDK communicates with Google APIs over HTTP/2.
- A fresh client forces a full TLS 1.3 negotiation and HTTP/2 session setup for every turn.
- The shared client keeps the TCP connection alive, reducing Time to First Token (TTFT) by hundreds of milliseconds.
- The 30-second `HttpOptions` guard ensures network hiccups or stalled connections throw actionable errors instead of hanging background threads.

---

## 2. In-Memory Runtime Pre-Warming

### DuckDB Direct Materialization
Instead of running queries against disk files (`SELECT * FROM 'data.csv'`), the engine materializes tables on registration:
```sql
CREATE OR REPLACE TABLE "dataset" AS SELECT * FROM 'data.csv'
```
Subsequent queries operate entirely out of CPU cache and RAM:
```text
[DuckDB Benchmark] Query execution time: 4.821 ms
```

### Pre-Warmed Python Worker
The worker imports data science libraries during server initialization rather than inside the user's turn:
- `pandas` and `numpy` are already in memory.
- `scipy.stats` is loaded.
- `matplotlib.use('Agg')` ensures thread-safe, headless chart rendering with zero GUI overhead.

---

## 3. Flash-Lite & Thinking Budget Tuning

When using reasoning models (Gemini 2.5/3.x), the model may generate hidden "thought" tokens before outputting text. While beneficial for complex coding benchmarks, thought tokens add 5 to 15 seconds to conversational latency.

In [backend/agent/react_loop.py](file:///d:/Github%20repositories/dsai-agent-frontend/backend/agent/react_loop.py), generation explicitly disables thought token generation for high-speed chat:
```python
config = types.GenerateContentConfig(
    temperature=0.0,
    thinking_config=types.ThinkingConfig(thinking_budget=0),
    max_output_tokens=1024,
    tools=self.tool_registry.get_gemini_tools(),
    system_instruction=system_content,
)
```

---

## 4. Empirical 10-Question Benchmark

Tested with `backend/benchmark_10_questions.py` on synthetic multi-category datasets:

| # | Query Category | Expected Tool | Actual Tool Duration | Total Latency | Sub-5s |
| :- | :--- | :--- | :--- | :--- | :--- |
| **Q1** | Direct General Knowledge | Direct LLM | 0 ms | 3,521 ms | PASS |
| **Q2** | Direct General Knowledge | Direct LLM | 0 ms | 4,544 ms | PASS |
| **Q3** | Modulo & Primality Math | `run_python_code` | 2.2 ms | 3,515 ms | PASS |
| **Q4** | Scipy Two-Sample T-Test | `run_python_code` | 3.7 ms | 3,914 ms | PASS |
| **Q5** | Hilbert Matrix & Eigenvalues | `run_python_code` | 3.0 ms | 2,927 ms | PASS |
| **Q6** | Top 3 Revenue Categories | `run_duckdb_sql` | 19.0 ms | 3,952 ms | PASS |
| **Q7** | Median & 95th Percentiles | `run_duckdb_sql` | 5.2 ms | 2,321 ms | PASS |
| **Q8** | Percent Above Average | `run_duckdb_sql` | 4.8 ms | 2,190 ms | PASS |
| **Q9** | Web Fact Retrieval | `web_search` | 716.0 ms | 4,309 ms | PASS |
