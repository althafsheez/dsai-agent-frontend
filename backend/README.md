# DSAI backend

This is the minimal functional modular monolith for the DSAI frontend. It persists demo users, workspaces, chats, ordered messages, agent runs, public execution events, and future file/resource associations. Gemini is accessed only through a provider adapter. The runner is independent of FastAPI and currently streams text only.

## Run locally

From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Add DSAI_GEMINI_API_KEY to backend/.env for live generation.
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

The app also creates a missing development schema on startup. Alembic remains the source of versioned production schema changes. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately.

Run tests:

```bash
backend/.venv/bin/pytest -c backend/pytest.ini backend/tests
```

## Frontend migration path

The current frontend mock records already resemble the API's snake_case DTOs, but its presentation types use camelCase and rendered message blocks. Add the HTTP adapter later under `src/lib/api`; map API `Chat`, `Message`, and SSE envelopes into those presentation types there. Do not fetch inside components or mirror API records into Zustand. The canonical stream endpoint is `POST /api/chats/{chat_id}/messages/stream` using `fetch`, not `EventSource`, because it has a JSON request body.

## Future tools without restructuring

The empty `ToolRegistry` is the extension seam. A Tavily tool will validate a query, call Tavily with a backend-only key, and return a bounded public result. An E2B tool will own one sandbox per run, stage authorized resource bytes under `/home/user/inputs`, execute code, and pass discovered `/home/user/outputs` bytes through `LocalFileStorage` plus the resource service. The `AgentRunner` can then add provider tool declarations and repeat provider/tool iterations while routes, SSE serialization, run persistence, and ownership checks stay unchanged.

No Tavily, E2B, SQL, visualization, Langfuse, evaluation, queue, or steering implementation is included in this slice.
