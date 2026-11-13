# DSAI backend

This backend connects the chat UI to one Gemini agent and one E2B Code Interpreter sandbox per active run. SQLite stores chats, messages, runs, public execution events and resource metadata; local storage keeps uploaded and generated files. Public progress and answers are delivered over SSE.

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

Configure `DSAI_TAVILY_API_KEY` and `DSAI_E2B_API_KEY` in `backend/.env` to enable the external tools. Conventional `TAVILY_API_KEY` and `E2B_API_KEY` names are also accepted. Credentials remain on the backend.

The execution flow is deliberately small:

- `AgentRunner` stages authorized chat/workspace resources and owns tool cleanup for the run.
- `GeminiProvider` maintains the model/tool conversation, preserving function-call IDs and original signed response parts. Steering is appended at safe checkpoints in the same conversation; it does not restart Python or discard tool results. Remaining calls from an outdated plan are skipped with matching function responses.
- `E2BSandboxPool` reuses the run sandbox, returning stdout, stderr, last-expression text and bounded display text. Displayed PNG charts are collected as output files, without sending base64 images into the model context.
- The tool handlers copy supported outputs into durable local storage and register chat-scoped resources before publishing resource events. A successful calculation stays successful if output collection fails; warnings explain the separate file problem. Files saved before a later Python error are still preserved. Output hashes are acknowledged only after persistence succeeds, allowing a subsequent tool call to retry a failed save.

Upload/preview/download APIs stage attached resources under `/home/user/inputs/`. Save generated tables and charts directly under `/home/user/outputs/`; text file tools restrict writes to that directory. The sandbox is closed after completion, failure or cancellation, while registered files remain downloadable.

## Live execution checks

The deterministic tests use fake Gemini/E2B transports; they verify SDK message shapes, staging, output persistence/download, steering and cancellation, but do not prove live provider availability.

With an E2B key configured, run this separate smoke test from the repository root. It uploads a CSV, runs Python, checks stdout and the last expression, downloads a generated CSV, and closes the sandbox. It does not require Gemini:

```bash
DSAI_LIVE_E2B=1 backend/.venv/bin/pytest -c backend/pytest.ini backend/tests/test_live_e2b.py -q
```

The existing Gemini smoke test is opt-in through `DSAI_LIVE_GEMINI=1`. A complete credential-backed Gemini + E2B chart demo remains a separate acceptance check.
