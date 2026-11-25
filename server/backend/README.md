# DSAI backend

FastAPI owns authentication, chat and workspace records, Library, Quick Assistant, file storage, run coordination, and persistent SSE events. Main chat uses the in-process `AgentExecution` interface in `server/agentic/runtime/contracts.py`. The runner in `server/agentic/` uses the shared ReAct loop, Gemini provider, tool registry, and E2B. It receives conversation history and run controls from FastAPI and yields public execution events. The backend adapter in `app/services/agent_adapter.py` supplies scoped inputs and workspace context, registers generated files, and persists per-user memory through the `ToolHost` interface.

The default budget is eight tool turns followed by a tool-free synthesis when needed. Set `DSAI_MAX_AGENT_STEPS` to override that budget. Both modules run in the FastAPI process. The existing `server/agentic/app.py` benchmark entry point is separate from the chat startup path.

## Run locally

From the repository root:

```bash
python3 -m venv server/backend/.venv
server/backend/.venv/bin/pip install -r server/backend/requirements.txt
cp -n server/backend/.env.example server/backend/.env
# Add DSAI_GEMINI_API_KEY to server/backend/.env for live generation.
server/backend/.venv/bin/uvicorn app.main:app --app-dir server/backend --reload --port 8000
```

Start the frontend in a second terminal with `npm run dev` and open `http://localhost:3000`. Both processes run from the repository root.

The app also creates a missing development schema on startup. Alembic remains the source of versioned production schema changes. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately.
Library PDF thumbnails use Poppler’s `pdftocairo` executable (provided by `poppler-utils` on Ubuntu).

By default startup applies Alembic upgrades before serving requests. Before upgrading an existing SQLite schema, it writes a consistent backup beside the database named `dsai.db.backup-<timestamp>-<id>` (using the configured database filename). Keep or remove backups according to your local retention needs. Set `DSAI_AUTO_CREATE_SCHEMA=false` when migrations are managed separately; in that case, back up the database and run Alembic manually before starting the app.

Run tests:

```bash
server/backend/.venv/bin/pytest -c server/backend/pytest.ini server/backend/tests
```

## Frontend integration

The main frontend chat is connected through the typed adapter under `src/lib/api`. It uses TanStack Query for persisted records and `fetch` for the canonical `POST /api/chats/{chat_id}/messages/stream` endpoint because the stream request has a JSON body. The incremental SSE parser updates active assistant text while completed messages and events remain backend-owned and reloadable.

## Agent tools

The single Gemini agent now has an allowlisted tool loop with persisted public `tool.started`, `tool.completed`, and `tool.failed` events. Available tools cover Tavily web search, E2B Python execution, bounded sandbox file operations, read-only CSV/Parquet SQL lookup, visualization execution, and user-scoped SQLite memory.

Configure `DSAI_TAVILY_API_KEY` and `DSAI_E2B_API_KEY` in `server/backend/.env` to enable the external tools. E2B uses one sandbox per active run, restricts writes to `/home/user/outputs/`, rejects hidden/escaping paths, bounds output, closes the sandbox after the run, and registers supported generated files as chat-scoped resources in local storage. Gemini remains the only agent/model coordinator; the tools do not create a second agent framework.

The API stages authorized chat and workspace inputs under `/home/user/inputs/`. To check the main-chat path against real services with a temporary database, run `DSAI_LIVE_E2B=1 server/backend/.venv/bin/pytest -q server/backend/tests/test_live_gemini.py -k react_python`. This exercises a Gemini tool call, E2B execution, generated dataset registration, and download.

## PostgreSQL connections

The connector reads data on demand through a dedicated PostgreSQL login. The local demo user (`user-you`) owns connections in each tester's DSAI application database. A workspace-associated connection is available only for questions in that workspace. Each question explicitly attaches its source, including when submitted through the queue. Retry uses the original question's source.

### Configure the backend

| Variable | Purpose |
| --- | --- |
| `DSAI_CONNECTOR_ENCRYPTION_KEY` | Required Fernet key. Keep this value stable across local restarts. |
| `DSAI_POSTGRES_ALLOWED_TARGETS` | Optional comma-separated loopback IP and port pairs for isolated test fixtures, for example `127.0.0.1:5432`. |
| `DSAI_POSTGRES_PRIVATE_TARGETS` | Optional JSON object mapping exact private endpoints to arrays of approved CIDRs, for example `{"sales.internal:5432":["10.42.3.0/24"]}`. Private destinations are blocked by default. |
| `DSAI_POSTGRES_CA_FILE` | Optional absolute path to a trusted CA bundle when the database uses a private CA. By default the connector uses Python's system CA bundle path when available. The database certificate must match the configured hostname. |
| `DSAI_POSTGRES_STATEMENT_TIMEOUT_MS` | Optional per-statement timeout. Default 5000 ms. |
| `DSAI_ENVIRONMENT` | Use `development` for local testing. For a PostgreSQL server on the same machine, use `test` and explicitly allowlist a literal loopback address and port. Keep TLS enabled when the fixture supports it. |

Generate the encryption key locally and store it in `server/backend/.env`.

```bash
server/backend/.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Bind the frontend and backend to loopback in separate terminals. Keep this local application database and encryption key on the tester's machine. The connector is disabled in production, and a local backend configured with the key restricts its API to loopback. For a local database previously used with the token flow, re-add the connection under the demo account.

```bash
server/backend/.venv/bin/uvicorn app.main:app --app-dir server/backend --host 127.0.0.1 --port 8000 --no-proxy-headers
npm run dev -- --hostname 127.0.0.1
```

### Verify with a real PostgreSQL database

1. Have a PostgreSQL administrator create a dedicated reader. The following `psql` example grants access to two tables in an existing database.

   ```sql
   CREATE ROLE dsai_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
   \password dsai_reader
   GRANT CONNECT ON DATABASE sales TO dsai_reader;
   GRANT USAGE ON SCHEMA analytics TO dsai_reader;
   GRANT SELECT ON TABLE analytics.orders, analytics.products TO dsai_reader;
   ```

   The login must have neither inherited write privileges nor ownership or creation privileges in the database. For older PostgreSQL installations, check grants inherited from `PUBLIC`, especially `CREATE` on the `public` schema.

2. For a public database, use a TLS-enabled endpoint and a certificate that matches its hostname. Enter that endpoint directly in the connector. The backend validates every resolved address and pins the selected IP for the connection. With `DSAI_AUTO_CREATE_SCHEMA=true` the existing startup migration flow applies Alembic revision `20261123_0012`. If a separate step handles migrations, run `server/backend/.venv/bin/alembic -c server/backend/alembic.ini upgrade head` from the repository root.
3. Open **Connectors** and click **Connect** on the PostgreSQL card. Enter the connection name, DNS name, port, database and reader credentials. Run **Test Connection**, choose the allowed schemas, then save.
4. Open **Browse tables**. Confirm that the permitted tables appear, the columns and primary key agree with PostgreSQL, and **Preview rows** returns the expected data. Verify that disabling previews in **Edit** removes row-preview access.
5. Start **New Analysis** or open a chat. Open **+ → Data Sources**, select the saved connection, and send a question such as “Using analytics.orders, calculate monthly revenue for the last six months and create a bar chart.” Inspect the **Query Database** step and compare the totals with a query run independently in PostgreSQL.
6. Restart the backend, reload the Connectors page, and open the saved connection again. Verify that a retry retains the selected source.

### Connector limits and test commands

The PostgreSQL SQL parser accepts bounded, single-statement SELECT queries against permitted ordinary tables with built-in column types and no row-level security. Views, foreign tables, partitioned parents, tables with custom types, and queries with write operations, row locks, unsafe functions, or recursive CTEs are unavailable. The adapter checks database privileges, disables inherited table scans, and uses read-only transactions. Query results are limited to 200 rows and approximately 96 KB, and oversized individual rows are reported as truncated. Credentials stay in the backend. If AI access is enabled and selected for a question, authorized schema metadata and bounded query results are sent to Gemini. Query results used to generate a chart or report can also be sent to the existing E2B sandbox.

Run the focused security tests with `server/backend/.venv/bin/python -m pytest server/backend/tests/test_postgres_connector.py`. To add the real-database suite, set `DSAI_TEST_POSTGRES_ADMIN_DSN` to an administrator DSN for an isolated PostgreSQL test instance listening on loopback, with password authentication for TCP connections. The test creates and removes its own schemas and role. Set `DSAI_TEST_POSTGRES_CA_FILE` to the test CA certificate to exercise verified TLS. The PostgreSQL certificate must include IP SAN `127.0.0.1`.

For the optional live Gemini/E2B check, set `DSAI_TEST_LIVE_POSTGRES_AGENT=1` with the isolated PostgreSQL test settings above and run:

```bash
server/backend/.venv/bin/python -m pytest -m live server/backend/tests/test_postgres_connector.py
```

For the optional browser check, seed a permitted `orders` table with an integer primary key and a `total` column containing 61 and 112. Configure the local backend for the test reader and TLS certificate as above. Set `DSAI_TEST_BROWSER_POSTGRES_FORM` to a JSON object containing `host`, `port`, `database`, `username`, `password`, and `schema`. Run `npm run test:e2e -- tests/e2e/postgres.spec.ts`. The browser test uses real services and leaves Playwright tracing off so the test credentials do not enter trace artifacts.
The browser check verifies connection creation, table access, source attachment, and disconnection. Set `DSAI_TEST_BROWSER_LIVE_AGENT=1` to also require Gemini to complete the live query and final answer.

## Shared data (history, files, dashboards)

`shared-data/` holds a snapshot of the database rows (`snapshot.json`) and stored files (`files/`), so everyone who
clones the repo starts with the same workspaces, chats, datasets, Library and dashboards. A fresh database loads it
automatically on first start (disable with `DSAI_IMPORT_SHARED_DATA=false`). Connector tokens are never exported.

Run from the repo root:

```bash
server/backend/.venv/bin/python -m app.snapshot export   # refresh shared-data/ from your local data, then commit it
server/backend/.venv/bin/python -m app.snapshot import   # add missing rows/files from shared-data/ to your local data
```

Run these with `PYTHONPATH=server/backend:server` from the repo root so the relative `.env` paths resolve to the same database the server uses.

## Connector routes after the merge

Saved PostgreSQL connections are managed at `/api/connectors/postgresql`. Google Drive status is at `/api/connectors/google-drive/status`; the OAuth callback URL stays the same. Keep each connector's key stable. SQLite upgrades converge at Alembic revision `20261124_0019` from either branch and keep the existing credential tables. Shared snapshots exclude both connection tables and per-message connection IDs.
