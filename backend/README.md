# DSAI backend

This is the minimal functional modular monolith for the DSAI frontend. It persists demo users, workspaces, chats, ordered messages, agent runs, public execution events, and future file/resource associations. Gemini is accessed only through a provider adapter. The runner is independent of FastAPI and currently streams text only.

## Run locally

From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
# Add DSAI_GEMINI_API_KEY to backend/.env for live generation.
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

The app also creates a missing development schema on startup. Alembic remains the source of versioned production schema changes. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately.

Run tests:

```bash
backend/.venv/bin/pytest -c backend/pytest.ini backend/tests
```

## Frontend integration

The main frontend chat is connected through the typed adapter under `src/lib/api`. It uses TanStack Query for persisted records and `fetch` for the canonical `POST /api/chats/{chat_id}/messages/stream` endpoint because the stream request has a JSON body. The incremental SSE parser updates active assistant text while completed messages and events remain backend-owned and reloadable.

## Agent tools

The single Gemini agent now has an allowlisted tool loop with persisted public `tool.started`, `tool.completed`, and `tool.failed` events. Available tools cover Tavily web search, E2B Python execution, bounded sandbox file operations, read-only CSV/Parquet SQL lookup, visualization execution, and user-scoped SQLite memory.

Configure `DSAI_TAVILY_API_KEY` and `DSAI_E2B_API_KEY` in `backend/.env` to enable the external tools. E2B uses one sandbox per active run, restricts writes to `/home/user/outputs/`, rejects hidden/escaping paths, bounds output, closes the sandbox after the run, and registers supported generated files as chat-scoped resources in local storage. Gemini remains the only agent/model coordinator; the tools do not create a second agent framework.

Upload/preview/download APIs and automatic staging of uploaded chat resources into `/home/user/inputs/` remain part of the unfinished resource phase. Until that phase is connected, dataset lookup can operate only on files already present in the active sandbox.
