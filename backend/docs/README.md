# DSAI Agentic Backend Documentation

Welcome to the technical documentation for the **DSAI Agentic Engine & Backend**.

This documentation details the architecture, design choices, latency optimizations, execution engines, and observability pipeline powering the autonomous data science agent.

---

## Documentation Index

| Document | Topic | Description |
| :--- | :--- | :--- |
| **[01. Architecture Overview](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/01_architecture_overview.md)** | System Design | End-to-end architecture, Next.js frontend SSE integration, FastAPI backend, and sub-5s latency design principles. |
| **[02. ReAct Agent Loop](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/02_react_loop.md)** | Autonomous Reasoning | Bounded 2-turn ReAct execution loop, prompt injection, SSE streaming lifecycle, and run cancellation. |
| **[03. Execution Engines](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/03_execution_engines.md)** | Local Runtimes | In-process DuckDB analytical SQL engine and pre-warmed persistent Python worker with hard timeout guards. |
| **[04. Tools & Registry](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/04_tools_and_registry.md)** | Extensible Tools | `BaseTool` abstract base class, Gemini schema generation, `ToolRegistry`, and step-by-step tool expansion guide. |
| **[05. Performance & Optimizations](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/05_performance_and_optimizations.md)** | Latency & Scaling | HTTP/2 SSL client pooling, warm state retention, sub-5s response tuning, and token streaming benchmarks. |
| **[06. Observability & Langfuse](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/06_observability_and_langfuse.md)** | Telemetry & Tracing | Dual-mode observability (human-readable audit logs, JSONL events, and Langfuse Cloud tracing with automated scoring). |
| **[07. API & SSE Contracts](file:///d:/Github%20repositories/dsai-agent-frontend/backend/docs/07_api_and_sse_contracts.md)** | API Reference | Comprehensive REST endpoints, SSE event protocol, payload contracts, and error specifications. |

---

## Directory Layout

```text
backend/
├── agent/
│   ├── prompts.py            # System instructions, dataset schemas, prompt contracts
│   └── react_loop.py         # 2-turn bounded ReAct autonomous reasoning engine
├── engine/
│   ├── duckdb_engine.py      # In-process analytical DuckDB SQL query engine
│   └── python_worker.py      # Pre-warmed Python worker with hard timeout protection
├── tools/
│   ├── base.py               # BaseTool ABC with auto-Gemini schema generator
│   ├── duckdb_tool.py        # run_duckdb_sql tool
│   ├── python_tool.py        # run_python_code tool
│   ├── search_tool.py        # web_search tool (Tavily + Wikipedia fallback)
│   └── registry.py           # Central tool registry with dynamic dispatch
├── logs/
│   ├── chat_traces.jsonl     # Machine-readable per-run event logs
│   └── chat_traces.log       # Human-readable formatted audit trace logs
├── tests/                    # 15 automated pytest suites covering endpoints & latency
├── app.py                    # FastAPI application, REST endpoints, and SSE streamer
├── client.py                 # Persistent Gemini client HTTP/2 connection pool
├── config.py                 # Multi-source environment resolution (.env)
├── db.py                     # In-memory SQLite state store (chats, messages, datasets)
├── observability.py          # Unified RunTracker with local audit & Langfuse tracing
└── requirements.txt          # Production dependencies
```

---

## Quick Start

### 1. Setup Virtual Environment
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

### 2. Configure Environment (`backend/.env`)
```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
TAVILY_API_KEY=optional_tavily_key
LANGFUSE_PUBLIC_KEY=optional_pk
LANGFUSE_SECRET_KEY=optional_sk
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 3. Start Development Server
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --port 8000
```
