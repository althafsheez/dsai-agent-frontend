# DSAI backend

FastAPI owns authentication, chat and workspace records, Library, Quick Assistant, file storage, run coordination, and persistent SSE events. Main chat uses the in-process `AgentExecution` interface in `agentic/runtime/contracts.py`. The runner in `agentic/` uses the shared ReAct loop, Gemini provider, tool registry, and E2B. It receives conversation history and run controls from FastAPI and yields public execution events. The backend adapter in `app/services/agent_adapter.py` supplies scoped inputs and workspace context, registers generated files, and persists per-user memory through the `ToolHost` interface.

The default budget is eight tool turns followed by a tool-free synthesis when needed. Set `DSAI_MAX_AGENT_STEPS` to override that budget. Both modules run in the FastAPI process. The existing `agentic/app.py` benchmark entry point is separate from the chat startup path.

## Run locally

From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
# Add DSAI_GEMINI_API_KEY to backend/.env for live generation.
backend/.venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

Start the frontend in a second terminal with `npm run dev` and open `http://localhost:3000`. Both processes run from the repository root.

The app also creates a missing development schema on startup. Alembic remains the source of versioned production schema changes. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately.
Library PDF thumbnails use Poppler’s `pdftocairo` executable (provided by `poppler-utils` on Ubuntu).

By default startup applies Alembic upgrades before serving requests. Before upgrading an existing SQLite schema, it writes a consistent backup beside the database named `dsai.db.backup-<timestamp>-<id>` (using the configured database filename). Keep or remove backups according to your local retention needs. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately; in that case, back up the database and run Alembic manually before starting the app.

Run tests:

```bash
backend/.venv/bin/pytest -c backend/pytest.ini backend/tests
```

## Frontend integration

The main frontend chat is connected through the typed adapter under `src/lib/api`. It uses TanStack Query for persisted records and `fetch` for the canonical `POST /api/chats/{chat_id}/messages/stream` endpoint because the stream request has a JSON body. The incremental SSE parser updates active assistant text while completed messages and events remain backend-owned and reloadable.

## Agent tools

The single Gemini agent now has an allowlisted tool loop with persisted public `tool.started`, `tool.completed`, and `tool.failed` events. Available tools cover Tavily web search, E2B Python execution, bounded sandbox file operations, read-only CSV/Parquet SQL lookup, visualization execution, and user-scoped SQLite memory.

Configure `DSAI_TAVILY_API_KEY` and `DSAI_E2B_API_KEY` in `backend/.env` to enable the external tools. E2B uses one sandbox per active run, restricts writes to `/home/user/outputs/`, rejects hidden/escaping paths, bounds output, closes the sandbox after the run, and registers supported generated files as chat-scoped resources in local storage. Gemini remains the only agent/model coordinator; the tools do not create a second agent framework.

The API stages authorized chat and workspace inputs under `/home/user/inputs/`. To check the main-chat path against real services with a temporary database, run `DSAI_LIVE_E2B=1 backend/.venv/bin/pytest -q backend/tests/test_live_gemini.py -k react_python`. This exercises a Gemini tool call, E2B execution, generated dataset registration, and download.
