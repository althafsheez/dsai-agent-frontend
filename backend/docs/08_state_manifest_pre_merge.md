# Complete Agentic Backend State Manifest (Pre-Merge Snapshot)

> **Snapshot Timestamp**: 2026-11-22T21:13:00+05:30  
> **Active Git Branch**: `feat/phase-0-agentic-rebuild`  
> **Safety Backup Branch**: `backup/perfect-agentic-backend` (Commit `b22c7d1`)  
> **Test Status**: 19/19 Backend Pytest Tests Passing | 100/100 Frontend Vitest Tests Passing

This document captures the entire inventory, architecture, schema, tool registry, prompt design, and test suite of the **DSAI Agentic Backend**. Use this as an authoritative baseline after running `git pull origin main` to instantly detect and restore any deleted or modified components.

---

## 1. Directory Tree & File Inventory

```text
backend/
├── .env                                  # Real API keys (GEMINI, LANGFUSE, TAVILY)
├── .env.example                          # Clean template documentation for env vars
├── .gitignore                            # Ignores .env, .venv, *.db, logs/, uploads/
├── __init__.py                           # Module marker
├── agentic.db                            # SQLite persistent store (Chats, Messages, Runs, Resources)
├── app.py                                # Main FastAPI server & SSE streaming router (858 lines)
├── benchmark_10_questions.py             # 10-Question latency & accuracy benchmark runner
├── benchmark_dataset.csv                 # 1,000-row synthetic test dataset
├── benchmark_results.json                # Benchmark execution results
├── client.py                             # Google Gemini SDK persistent client pool
├── config.py                             # Environment variable loading & model resolver
├── db.py                                 # SQLite schema migrations & database access methods
├── observability.py                      # Dual-layer audit logger (JSONL/text + Langfuse v5)
├── requirements.txt                      # Complete pinned dependencies for Python 3.12
│
├── agent/
│   ├── __init__.py                       # Package export
│   ├── math_sanitizer.py                 # LaTeX math -> Clean Unicode/Markdown converter
│   ├── prompts.py                        # System prompts with sub-5s budget & math legibility
│   └── react_loop.py                     # 2-turn maximum ReAct execution engine
│
├── engine/
│   ├── __init__.py                       # Package export
│   ├── duckdb_engine.py                  # In-process DuckDB engine (CSV/Parquet/Excel)
│   └── python_worker.py                  # Pre-warmed persistent Python worker with 5s timeout
│
├── tools/
│   ├── __init__.py                       # Package export
│   ├── base.py                           # BaseTool abstract class & Gemini schema generator
│   ├── duckdb_tool.py                    # run_duckdb_sql tool
│   ├── python_tool.py                    # run_python_code tool
│   ├── search_tool.py                    # web_search tool (Tavily + Wikipedia fallback)
│   └── registry.py                       # Central ToolRegistry & factory function
│
├── docs/
│   ├── README.md                         # Documentation index & quick reference
│   ├── 01_architecture_overview.md       # High-level architecture & dataflow diagrams
│   ├── 02_react_loop.md                  # 2-turn ReAct budget & synthesis specifications
│   ├── 03_execution_engines.md           # DuckDB & Warm Python Worker architecture
│   ├── 04_tools_and_registry.md          # Tool registry & Gemini tool calling interface
│   ├── 05_performance_and_optimizations.md # Latency budgets, pooling, pre-warming
│   ├── 06_observability_and_langfuse.md  # JSONL audit + Langfuse v5 OpenTelemetry tracing
│   └── 07_api_and_sse_contracts.md       # Complete FastAPI REST and SSE event contracts
│
├── tests/
│   ├── __init__.py                       # Package export
│   ├── test_chat_endpoints.py            # API routing, chat lifecycle, SSE streaming tests
│   ├── test_langfuse_observability.py     # Health status, local logs, Langfuse traces/scores
│   ├── test_math_sanitizer.py            # Math & churn formula sanitization tests
│   ├── test_phase0_latency.py            # Sub-50ms DuckDB, sub-100ms Python, 5s timeout
│   └── test_tools_expansion.py           # ToolRegistry dynamic registration & ReAct tests
│
└── logs/
    ├── chat_traces.jsonl                 # Machine-readable NDJSON telemetry logs
    └── chat_traces.log                   # Human-readable formatted audit blocks
```

---

## 2. Core Modules & Component Architecture

### A. Main Application Server ([`backend/app.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/app.py))
- **Framework**: FastAPI with CORS middleware.
- **Global In-Memory Engines**:
  - `global_duckdb = DuckDBEngine()`: Thread-safe in-process analytics.
  - `global_worker = WarmPythonWorker()`: Pre-warmed Python execution session.
- **Key API Routes**:
  - `GET /health`: Reports engine readiness, Gemini key configuration, and `langfuse_configured`.
  - `GET /api/models`: Model allowlist (`gemini-3.1-flash-lite`, `gemini-3.5-flash`) with supported efforts (`low`, `medium`, `high`).
  - `POST /api/chats`: Creates chat and first user message (per invariant: first send creates chat).
  - `GET /api/chats/{id}/messages`: Message list retrieval.
  - `POST /api/chats/{id}/messages/stream` / `POST /api/chats/{id}/runs`: Main SSE endpoint streaming ReAct events (`agent.started`, `message.created`, `tool.started`, `tool.completed`, `message.delta`, `run.completed`).
  - `POST /api/chats/{id}/files` & `POST /api/workspaces/{id}/files`: Uploads datasets to `backend/uploads/` and registers them into DuckDB.
  - `GET /api/observability/traces`: Fetches audit logs from `chat_traces.jsonl`.
  - `POST /api/query`: Direct analytical query endpoint.

### B. ReAct Execution Engine ([`backend/agent/react_loop.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/agent/react_loop.py))
- **Class**: `ReActAgent`
- **Budget**: Strict maximum 2-turn execution limit:
  - **Turn 1**: Executes necessary tools (`run_duckdb_sql`, `run_python_code`, `web_search`) via Gemini function calling.
  - **Turn 2**: Tool-free analytical synthesis (`tools=None`), emitting narrative and inline Plotly JSON charts.
- **Observability Hooks**:
  - Emits `start_generation` and `end_generation` to `RunTracker` for every Gemini reasoning turn.
  - Applies `sanitize_math_text()` to clean final responses.
- **Graceful Offline Fallback**: If `GEMINI_API_KEY` is missing, returns instant schema preview and row counts directly from DuckDB without crashing.

### C. System Prompts & Legibility ([`backend/agent/prompts.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/agent/prompts.py))
- **`SYSTEM_PROMPT` Principles**:
  1. **SQL First for Data Operations**: Use DuckDB for filtering, grouping, percentiles.
  2. **Python for Advanced Stats & Modeling**: Use warm worker for ANOVA, t-tests, regressions.
  3. **Plotly JSON for Visualizations**: Emit fenced ```plotly_json blocks; never save PNG/SVG files.
  4. **Strict Turn Economy**: 2 turns maximum.
  5. **Direct Answers for Conceptual Knowledge**: Immediate Turn 1 answers for trivia/general knowledge without tool overhead.
  6. **Mathematical & Formula Output Legibility**: Strictly forbids raw LaTeX (`$...$`, `\text`, `\mathbf`, `\frac`, `\times`). Enforces clean Unicode (`×`, `/`, `**4.0%**`, `(Share_P × Churn_P)`).

### D. Math & Formula Sanitizer ([`backend/agent/math_sanitizer.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/agent/math_sanitizer.py))
- **Function**: `sanitize_math_text(text: str) -> str`
- **Capabilities**:
  - Un-wraps `$$...$$`, `\[...\]`, `\(...\)`, and `$math$` blocks.
  - Strips `\text{}`, `\mathrm{}`, `\operatorname{}`.
  - Converts `\mathbf{...}` and `\textbf{...}` to Markdown bold `**...**`.
  - Converts `\mathit{...}` and `\textit{...}` to `*...*`.
  - Converts `\frac{a}{b}` to `(a / b)`.
  - Converts LaTeX symbols to Unicode: `\times` $\rightarrow$ `×`, `\cdot` $\rightarrow$ `·`, `\div` $\rightarrow$ `÷`, `\pm` $\rightarrow$ `±`, `\approx` $\rightarrow$ `≈`, `\neq` $\rightarrow$ `≠`, `\le`/`\leq` $\rightarrow$ `≤`, `\ge`/`\geq` $\rightarrow$ `≥`, `\alpha` $\rightarrow$ `α`, `\beta` $\rightarrow$ `β`, `\mu` $\rightarrow$ `μ`, `\sigma` $\rightarrow$ `σ`, `\sum` $\rightarrow$ `Σ`.
  - Safely preserves standard currency values (e.g. `$1,500,000`, `$4.2M`).

### E. Execution Engines ([`backend/engine/`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine))
1. **`DuckDBEngine` ([`duckdb_engine.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine/duckdb_engine.py))**:
   - In-process DuckDB instance with persistent thread lock.
   - Registers CSV, Parquet, and Excel files into table `dataset`.
   - `run_query(sql, max_rows)` executes read-only SQL in <20ms.
2. **`WarmPythonWorker` ([`python_worker.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/engine/python_worker.py))**:
   - Pre-warmed Python worker session with `pandas`, `numpy`, `scipy`, `scipy.stats` pre-imported.
   - Headless `matplotlib` pre-initialized with `Agg` backend.
   - Enforces a 5.0-second hard execution timeout.
   - State persists across turns in the same run.

### F. Tools & Registry ([`backend/tools/`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/tools))
- **`BaseTool`**: Standardized interface producing Google GenAI `types.Tool` definitions.
- **`DuckDBTool`**: Implements `run_duckdb_sql(sql: str)`.
- **`PythonTool`**: Implements `run_python_code(code: str)`.
- **`WebSearchTool`**: Implements `web_search(query: str)` using Tavily API with Wikipedia OpenSearch API fallback.
- **`ToolRegistry`**: Dynamic registration, lookup, execution, and Gemini tool list generation.

### G. Dual-Layer Observability & Langfuse v5 ([`backend/observability.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/observability.py))
- **`RunTracker` Class**:
  - Records Time-to-First-Token (`ttft_ms`), tool execution latencies, LLM synthesis duration, and total response time.
  - Layer 1: Appends machine-readable records to `backend/logs/chat_traces.jsonl` and formatted audit logs to `backend/logs/chat_traces.log`.
  - Layer 2: OpenTelemetry-native Langfuse v5 SDK integration:
    - `propagate_attributes`: Associates `session_id=chat_id` (for Langfuse Sessions view), `user_id`, and `tags=["dsai-agent", "phase-0", model]`.
    - Root observation: `as_type="agent"`, name `"dsai_agent_run"`.
    - LLM generation spans: `as_type="generation"` with input prompts and token completions.
    - Child tool spans: `as_type="tool"` (DuckDB, Python) or `as_type="retriever"` (WebSearch).
    - Automated metrics scoring: `total_response_time_ms`, `ttft_ms`, `sub_5s`, `turns`, `tool_calls_count`.
    - Flushes automatically on completion via `langfuse.flush()`.
    - Zero-overhead local fallback when Langfuse keys are absent.

### H. Database & Schema ([`backend/db.py`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/db.py))
- SQLite storage in `backend/agentic.db`.
- Schema tables:
  - `workspaces`: `id`, `name`, `description`, `archived`, `created_at`, `updated_at`.
  - `chats`: `id`, `workspace_id`, `title`, `archived`, `is_unread`, `active_run_status`, `created_at`, `updated_at`.
  - `messages`: `id`, `chat_id`, `role`, `content`, `status`, `position`, `created_at`.
  - `runs`: `id`, `chat_id`, `user_message_id`, `assistant_message_id`, `status`, `model_id`, `effort`, `total_duration_ms`, `metrics_json`.
  - `run_events`: `id`, `run_id`, `sequence`, `event_type`, `data_json`, `created_at`.
  - `resources`: `id`, `scope_id`, `file_name`, `file_path`, `file_size`, `mime_type`, `resource_type`, `created_at`.
  - `favorites`: `id`, `resource_id`, `created_at`.

### I. Pinned Dependencies ([`backend/requirements.txt`](file:///d:/Github%20repositories/dsai-agent-frontend/backend/requirements.txt))
```text
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
duckdb>=1.1.0
pandas>=2.2.0
scipy>=1.13.0
pydantic>=2.8.0
google-genai>=1.0.0
python-dotenv>=1.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
python-multipart>=0.0.9
pyarrow>=15.0.0
openpyxl>=3.1.0
matplotlib>=3.8.0
seaborn>=0.13.0
aiofiles>=23.2.0
langfuse>=5.0.0
```

---

## 3. Test Suite Baseline (19 Passing Tests)

Run command: `.\.venv\Scripts\python.exe -m pytest -v backend/tests/`

| Test File | Test Name | Target Verified |
| :--- | :--- | :--- |
| `test_chat_endpoints.py` | `test_models_endpoint` | Gemini model allowlist & supported efforts |
| `test_chat_endpoints.py` | `test_chat_lifecycle_and_streaming` | Chat creation, message persistence, SSE event flow |
| `test_chat_endpoints.py` | `test_csv_upload_and_registration` | Multipart file upload & DuckDB registration |
| `test_chat_endpoints.py` | `test_observability_logging_and_api` | JSONL trace emission & `/api/observability/traces` |
| `test_langfuse_observability.py` | `test_health_reports_langfuse_status` | Health endpoint reporting `langfuse_configured` |
| `test_langfuse_observability.py` | `test_run_tracker_without_langfuse` | Zero-overhead local fallback when unconfigured |
| `test_langfuse_observability.py` | `test_run_tracker_with_langfuse_mocked` | Delegation of agent, tool spans, and 4 scores |
| `test_langfuse_observability.py` | `test_generation_and_retriever_tracing` | Generation observation & retriever observation types |
| `test_math_sanitizer.py` | `test_sanitize_math_text_with_user_churn_example` | LaTeX removal and clean Unicode formatting |
| `test_math_sanitizer.py` | `test_sanitize_math_preserves_currency` | Preserves currency amounts like `$1,500,000` |
| `test_math_sanitizer.py` | `test_sanitize_fractions_and_operators` | Converts `\frac`, `\approx`, `\pm` to clean text |
| `test_phase0_latency.py` | `test_duckdb_aggregate_latency` | DuckDB aggregation <50ms benchmark |
| `test_phase0_latency.py` | `test_python_worker_statistical_calculation` | Python warm worker execution <100ms |
| `test_phase0_latency.py` | `test_python_worker_hard_timeout` | Python worker 5-second hard timeout abort |
| `test_phase0_latency.py` | `test_fastapi_sse_streaming_endpoint` | FastAPI streaming response latency |
| `test_phase0_latency.py` | `test_health_and_gemini_config` | Health check reports operational engines |
| `test_tools_expansion.py` | `test_default_tool_registry` | Default registry contains DuckDB, Python, Search |
| `test_tools_expansion.py` | `test_custom_tool_registration_and_execution` | Dynamic runtime tool registration & execution |
| `test_tools_expansion.py` | `test_react_agent_with_custom_registry` | Agent ReAct execution with custom tool registry |

---

## 4. Frontend Alignment ([`src/features/chat/components/assistant-message.tsx`](file:///d:/Github%20repositories/dsai-agent-frontend/src/features/chat/components/assistant-message.tsx))
- **`cleanLatexMath()`**: Integrated into `MarkdownText` rendering pipeline.
- **Heading & List Support**: Added rendering for `### ` subheadings and `* ` asterisk bullets.
- **Typecheck & Tests**: 100/100 Vitest tests pass across all 29 test suites (`npx tsc --noEmit` clean with 0 errors).

---

## 5. Instructions for Pulling Main & Restoring

1. Run:
   ```bash
   git pull origin main
   ```
2. Once pulled, invoke Antigravity with your second prompt:
   > *"I have pulled main. Compare the current state of backend/ against the manifest and restore anything that was removed or broken."*
3. Because the backup branch `backup/perfect-agentic-backend` exists, we can also instantly run:
   ```bash
   git diff backup/perfect-agentic-backend HEAD -- backend/
   ```
   to see every single line altered or deleted by upstream changes and restore it seamlessly.
