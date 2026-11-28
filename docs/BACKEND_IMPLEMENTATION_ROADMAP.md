# DSAI Backend Implementation Roadmap

Status: **Proposed** (2026-11-28). Companion to [DSAI_BACKEND_ARCHITECTURE_PROPOSAL.md](DSAI_BACKEND_ARCHITECTURE_PROPOSAL.md) and [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

No durations are promised; phases are sequential and each ends with verified acceptance criteria, in line with the repository's working rules (`AGENTS.md`: "Finish and verify a phase before advancing; record partial/blocked checks honestly").

## Starting point (verified)

- Frontend: Next.js 15 app with a central typed API client (`src/lib/api/client.ts`, `types.ts`) and a POST-fetch SSE parser. It talks to one base URL (`NEXT_PUBLIC_API_URL`) and sends `X-Demo-User-Id`.
- Backend prototype: `server/backend` (FastAPI, SQLAlchemy, SQLite, Alembic, 20 revisions, pytest suite) and `server/agentic` (runner, tool registry, Gemini provider, E2B pool). Implements most of `API_CONTRACT.md` in a single process.
- The roadmap **evolves this code**; it does not start a new repository. The prototype's contracts (`AgentExecution`, `ToolHost`, `LLMProvider`, storage abstraction) and tests are reused.

## Frontend integration principles

1. `API_CONTRACT.md` is the compatibility contract. Backend changes are additive; any DTO change updates `src/lib/api/types.ts` and backend schemas in the same PR.
2. Frontend changes are confined to `src/lib/api` and `src/features/auth` unless a feature is new.
3. Contract tests: backend responses are validated against the frontend's TypeScript DTOs (generate JSON Schema from Pydantic models and type-check fixtures in Vitest).
4. Every phase keeps `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the Playwright critical flows green against the new backend.

---

## Phase 1 — Backend foundation

**Deliverables**
- Package restructure into modules (`server/dsai/...`, see proposal §8) with import-linter contracts; entrypoints for `api`, `agent-worker`, `data-worker`, `scheduler` (workers can be stubs).
- PostgreSQL schema baseline (Alembic) for identity, workspaces, membership, chats, messages, runs, events, resources; async SQLAlchemy engine; pool settings per role.
- Docker Compose for local development: PostgreSQL, Valkey, GCS emulator (or MinIO via S3 adapter).
- OIDC token verification (`TokenVerifier`), user provisioning, `current_user` dependency; demo identity retained **only** when `environment=local` for tests and fixtures.
- `ObjectStore` interface with GCS implementation (put/get stream/sign/head/delete) and a local implementation for tests.
- Settings via Pydantic Settings + Secret Manager loader; no secrets in repository.
- CI: ruff, type checking, import-linter, pytest with PostgreSQL/Valkey service containers, container build.
- Observability skeleton: OpenTelemetry SDK, JSON logs with `request_id`.
- Seed loader adapted from `server/backend/app/snapshot.py` for development data.

**Dependencies:** IdP choice (Q3), region (Q11), GCP projects for dev/staging.

**Suggested technologies:** FastAPI, SQLAlchemy 2 async + asyncpg/psycopg 3, Alembic, Pydantic Settings, google-cloud-storage, redis-py (Valkey), OpenTelemetry, import-linter, Docker.

**Engineering complexity:** Medium (mostly porting and restructuring).

**Risks:** SQLite-specific behaviour hidden in current queries (e.g. type affinity, JSON handling); auth change touches every route.

**Acceptance criteria**
- All existing backend tests pass against PostgreSQL (ported where SQLite-specific).
- No `async def` route or dependency performs synchronous DB I/O (lint rule passes).
- Requests without a valid JWT are rejected (401) in non-local environments; demo header is ignored outside `local`.
- Files written and read through `ObjectStore` (GCS emulator in CI).
- Frontend: `client.ts` sends `Authorization: Bearer` from `useAuth()`; typecheck, lint, unit tests and build pass; Playwright smoke passes against the new backend locally.

---

## Phase 2 — Core product functionality

**Deliverables**
- `workspace_members` with roles; capability checks in `access`; invite acceptance creates membership; History "All" uses membership.
- Chats/messages/history/navigation/Library/Quick Assistant threads on PostgreSQL with indexes from proposal §11.3 and cursor pagination.
- Resource uploads: signed resumable upload endpoints (`POST /api/resources/uploads`, `…/complete`), idempotent by `client_upload_id`; existing multipart endpoint retained for ≤ 25 MB.
- Ingest job (initially executed in-process behind the `Dispatcher` interface, moved to data-worker in Phase 4): validation, sniffing, profiling, preview JSON.
- Downloads via authorised signed-URL redirects.
- Relational `dashboard_shares` / pins replacing JSON arrays (data migration).
- Audit log writes for membership, sharing, deletion, downloads.

**Dependencies:** Phase 1.

**Suggested technologies:** pg_trgm for search; DuckDB for profiling; openpyxl read-only for Excel.

**Engineering complexity:** Medium.

**Risks:** Upload UX regressions; membership semantics for standalone chats when moved into a workspace (datasets stay chat-scoped — preserve).

**Acceptance criteria**
- API tests: no record before Send; partial upload retry without duplicates; chat move preserves ID, messages, runs, chat-scoped datasets; preview capped at 100 rows and served from precomputed data; favourites never copy bytes; independent archive; soft delete preserves bytes; non-member access returns 403/404 on every endpoint (enumerated test).
- A 500 MB CSV uploads without passing through the API (verified by API request size metrics) and reaches `ready`.
- Frontend critical demo steps 1–3 and 6–9 (`IMPLEMENTATION_PLAN.md`) pass in Playwright against staging.

---

## Phase 3 — AI execution

**Deliverables**
- `agent-worker` role with `/internal/runs/{id}/execute`; Cloud Tasks dispatcher (plus PostgreSQL poller implementation); claim + lease + renewal; reconciler (stale queued → re-enqueue; expired lease → interrupted; orphan sandbox kill).
- Event pipeline: in-memory sequencing, delta coalescing, Valkey Streams publish, batched PostgreSQL persistence, terminal-event ordering; per-instance SSE hub in `api`; heartbeats; replay endpoint with `Last-Event-ID`.
- Cancel/steer signals via Valkey mirrored in PostgreSQL; queue continuation from the worker.
- `ModelGateway` with Gemini adapter (moving SDK types out of `react_loop.py`), retries/timeouts/fallback in one layer, usage capture into `usage_records`.
- Context builder: windowed history + compact dataset/connection manifests (replacing full context JSON in the system instruction).
- `run_steps` checkpoints and redacted public payloads.
- Rate limits: per user/workspace run starts; global provider token buckets with "waiting for capacity" progress events.

**Dependencies:** Phases 1–2; confirmed model allowlist and quotas (Q4).

**Suggested technologies:** Cloud Tasks, Valkey Streams, google-genai, OpenTelemetry context propagation through task headers.

**Engineering complexity:** High (concurrency, failure semantics).

**Risks:** Subtle ordering bugs between Valkey and PostgreSQL; double execution if claim logic is wrong; provider throttling during tests.

**Acceptance criteria**
- Deterministic tests with a fake provider for: split SSE chunks, duplicate dispatcher delivery (no second run), worker crash mid-run (lease expiry → interrupted, partial content preserved), cancel at each checkpoint, steer applied/unapplied, queue order after completion and after failure (paused), retry creating a new run with the same user message.
- Load test (fake provider with realistic latency): 200 concurrent runs across ≥ 2 worker instances and ≥ 2 API instances meet the streaming SLO (worker emit → client p95 ≤ 150 ms) and acceptance SLO (≤ 500 ms) — results recorded, not assumed.
- Live Gemini run through the full path in staging, with usage records matching provider usage metadata.
- No per-delta database transaction remains (verified by query metrics).

---

## Phase 4 — Data processing

**Deliverables**
- `data-worker` role: ingest, Parquet canonicalisation, profiling, previews, exports (workspace ZIP), output promotion from sandbox quarantine.
- Sandbox staging via signed URLs (inputs) and signed PUT uploads (outputs); dedup by `(run_id, output_path, sha256)` and versioning.
- Dashboard SQL/DAX execution on DuckDB over full Parquet data in the data-worker; result cache keyed by dataset versions; model-written dashboard scripts moved to the sandbox (or the hardened subprocess, data-worker only).
- Derived datasets with lineage metadata.
- Scheduler: Cloud Scheduler → `/internal/tick`; workflow schedules claimed with `SKIP LOCKED` and `UNIQUE(workflow_id, scheduled_for)`; schedules evaluated in the workflow's stored timezone; dashboard Drive sync as scheduled jobs.
- Retention jobs (soft-delete purge, delta compaction, quarantine cleanup).

**Dependencies:** Phase 3 (worker/dispatcher patterns); product decision on Dashboards/Workflows scope (Q12).

**Suggested technologies:** DuckDB, pyarrow/Polars, Cloud Scheduler, GCS lifecycle rules.

**Engineering complexity:** Medium–High.

**Risks:** DAX-to-SQL semantics differences when moving from SQLite to DuckDB (existing `dax.py` tests must be ported and extended); memory sizing for large files.

**Acceptance criteria**
- Output path escape, symlink, oversize and duplicate-scan tests pass; modified outputs at the same path create new versions.
- Real Gemini + E2B run produces a chart artifact and an intermediate CSV dataset, both registered, previewable and downloadable (the open Phase 5 gate in `IMPLEMENTATION_PLAN.md`).
- Dashboard aggregate over a dataset with > 6,000 rows equals an independent DuckDB/pandas computation over the full file.
- With two scheduler-capable replicas running, each due workflow fires exactly once per scheduled time (test).

---

## Phase 5 — Production readiness

**Deliverables**
- PostgreSQL RLS on tenant tables (non-owner app role, `FORCE ROW LEVEL SECURITY`), with tests executed as the application role.
- Connector credential encryption moved to KMS envelope encryption with key versions; rotation runbook.
- Edge: HTTPS load balancer, Cloud Armor rules; strict CORS allowlist; security headers.
- Terraform for all environments; CI/CD with Workload Identity Federation, migration job, gradual traffic rollout and automatic rollback on SLO burn.
- Dashboards and alerts for SLOs (proposal §16.2), provider quota use, queue age, lease expiries, sandbox failures, DB and Valkey health.
- Load and soak tests against the Growth scenario profile (proposal §17) with recorded results; capacity model updated from measurements.
- Backup/restore drill (PITR to a new instance; bucket object restore) and documented RPO/RTO results.
- Security review (threat model, dependency and image scanning, penetration test of auth/tenant isolation and sandbox output paths).

**Dependencies:** Phases 1–4.

**Suggested technologies:** Terraform, Cloud Monitoring/Trace (or Grafana stack), k6 or Locust for load tests.

**Engineering complexity:** Medium.

**Risks:** Discovering capacity limits late — mitigated by Phase 3 load tests.

**Acceptance criteria**
- Measured SLOs meet or are documented against targets; any misses have an owner and a plan.
- Restore drill completed within the target RTO; data loss within RPO.
- Tenant isolation tests pass with RLS enabled and application checks disabled (defence-in-depth proof).
- No high/critical findings open from the security review.
- Production deploy and rollback exercised in staging.

---

## Cross-phase checklist

| Item | Phase introduced |
|---|---|
| Contract tests frontend ↔ backend | 1 |
| Audit logging | 2 |
| Usage ledger | 3 |
| Rate limiting | 3 |
| Load testing | 3 (first), 5 (full) |
| RLS | 5 |
| DR drill | 5 |

## What is explicitly not in this roadmap

Microservice extraction, Kafka, Temporal, LangGraph, multi-region deployment, self-hosted sandboxes, real-time collaboration and background runs that outlive the page (pending product decision Q1). Each has a revisit trigger in ADR-015.
