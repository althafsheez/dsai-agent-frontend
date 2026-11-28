# DSAI Backend — Architecture Decision Records

Status of every record: **Proposed** (2026-11-28). Records become *Accepted* only after team review. Evidence and source references (`[R#]`) point to [DSAI_BACKEND_ARCHITECTURE_PROPOSAL.md](DSAI_BACKEND_ARCHITECTURE_PROPOSAL.md) §24.

Template per record: Context · Problem · Options · Decision · Reasons · Advantages · Disadvantages · Consequences · Risks · Revisit when.

---

## ADR-001 — Modular monolith with independently scalable worker roles

**Context.** DSAI has one product team and one tightly coupled domain (chats, messages, runs, resources). Two workloads dominate resource use: agent runs (long-lived, I/O-bound) and dataset processing (CPU/memory-heavy). The previous system split the domain across a Node API and a Python agent service; the split required leases, heartbeats, cancellation polling and "uncertain outcome" recovery (`agentic-ds-backend/src/controllers/querySubmissionController.ts:150-215, 470-500`). The current prototype is a single process with in-memory run state (`server/backend/app/services/runs.py:26-63`).

**Problem.** Scale the heavy workloads independently without distributing the domain model.

**Options.** (1) Single-process monolith; (2) microservices per domain; (3) event-driven services; (4) modular monolith with worker roles; (5) managed components (combinable with 4).

**Decision.** One codebase and image, deployed as `api`, `agent-worker`, `data-worker` roles plus a scheduler entrypoint; modules with enforced import boundaries; managed GCP components behind interfaces.

**Reasons.** Keeps multi-entity operations in single PostgreSQL transactions; isolates the two heavy workloads; one deploy pipeline; matches team size.

**Advantages.** Simple local development; refactors across modules are cheap; fault isolation by workload; per-role autoscaling.

**Disadvantages.** Shared database couples modules at the data layer; a bad migration affects all roles; role images share dependencies.

**Consequences.** Module boundaries must be enforced in CI (import-linter). Internal calls between roles go only through the dispatcher.

**Risks.** Boundaries erode over time; mitigated by contracts in CI and code ownership.

**Revisit when.** Separate teams need independent release cadence for a module, or a module's scaling/availability profile diverges enough that sharing a database or image is the bottleneck (first candidates: model gateway, streaming hub).

---

## ADR-002 — Python + FastAPI, asynchronous end-to-end

**Context.** Agent code, provider SDKs, E2B helpers, data tooling and the prototype are Python. FastAPI runs `async def` on the event loop and `def` in a threadpool [R5]. The prototype calls a synchronous ORM inside `async` code paths (`server/backend/app/dependencies.py:11-13`; `services/runs.py:536-558`).

**Problem.** Pick a language/framework that serves I/O-heavy streaming and agent work efficiently and keeps one language across the backend.

**Options.** FastAPI; NestJS; Fastify; Go (Gin/Fiber); Django/Litestar.

**Decision.** FastAPI with async SQLAlchemy 2.0 (asyncpg or psycopg 3 async), async HTTP clients, async Valkey client. CPU-bound work runs only in the data-worker (process pool) or sandbox.

**Reasons.** Reuse of tested code; ecosystem fit; the dominant latencies (model, sandbox) are framework-independent.

**Advantages.** One language; high concurrency for I/O-bound work; Pydantic validation shared with DTOs.

**Disadvantages.** Higher per-request CPU than Go/Node; the GIL makes CPU work unsuitable for API/agent processes; async discipline required.

**Consequences.** CI lint rule against sync DB/HTTP calls in async functions; event-loop lag metric with alert.

**Risks.** Hidden blocking calls in third-party SDKs (wrap with `to_thread` and bound with limiters, as the prototype already does for E2B and connectors).

**Revisit when.** A component's profile shows framework/runtime CPU as the bottleneck (e.g. SSE fan-out at tens of thousands of connections) — consider a Go streaming edge for that component only.

---

## ADR-003 — PostgreSQL as the system of record

**Context.** The prototype uses SQLite (one writer at a time; WAL requires one host [R1][R2]). The previous system used MongoDB plus PostgreSQL (LangGraph checkpoints) plus Cloudflare D1; workspace roles were stored as dynamic keys `access.<userId>` (`spaceModel.ts:91-106`).

**Problem.** One transactional store that supports many uniqueness/ordering invariants, flexible JSON payloads, queue-like claims and tenant isolation.

**Options.** PostgreSQL; MySQL; MongoDB; distributed SQL (Spanner/CockroachDB/AlloyDB).

**Decision.** PostgreSQL (Cloud SQL Enterprise) for all application state, including run/event logs and usage; no MongoDB; user datasets stay in object storage.

**Reasons.** ACID with row locks and `SKIP LOCKED` [R4]; JSONB; RLS [R3]; mature tooling; replaces three previous stores.

**Advantages.** Simple transactions across modules; relational authorization; strong indexing options.

**Disadvantages.** Vertical write scaling; event logs need partitioning; operational care for migrations.

**Consequences.** New Alembic baseline for PostgreSQL; event tables partitioned monthly; no auto-migration on app start in production.

**Risks.** Event write volume (see ADR-006 mitigations).

**Revisit when.** Sustained write load approaches the largest practical instance after batching/partitioning, or multi-region writes become a requirement (evaluate AlloyDB, Citus, or moving events to a separate store).

---

## ADR-004 — Connection pooling strategy

**Context.** Cloud Run scales instances dynamically; each instance's pool multiplies connection count. PgBouncer transaction mode does not support `LISTEN`, session `SET`, or SQL `PREPARE`, but supports protocol-level prepared statements when `max_prepared_statements` is non-zero [R6].

**Problem.** Bound server connections while instance count varies.

**Options.** Direct connections with small pools; PgBouncer (transaction mode); Cloud SQL managed pooling (if available for the chosen edition — open question Q6).

**Decision.** Small per-process pools (api 10+5, agent-worker 5, data-worker 3) in front of a pooler in transaction mode; `SET LOCAL` only (transaction-scoped) for RLS context; direct connections for any `LISTEN` use.

**Reasons.** Predictable server connection count; compatible with RLS session variables via `SET LOCAL`.

**Advantages.** Scale-out does not exhaust database connections.

**Disadvantages.** One more component (if self-run); session features unavailable.

**Consequences.** Code must not depend on session state across transactions.

**Risks.** Prepared-statement incompatibilities with some drivers — test with the chosen driver and pooler version.

**Revisit when.** Pool wait time becomes a top latency contributor.

---

## ADR-005 — Durable run records, dispatcher and leases

**Context.** Both previous and prototype systems executed runs as tasks inside the API process (`dsai-agentic/src/APIs/queries_api.py:434`; `server/backend/app/routes/runs.py:43-58`). Cloud Run allocates CPU only during requests under request-based billing and may shut idle instances down [R8].

**Problem.** Execute long runs reliably, scale them independently, and avoid duplicate execution.

**Options.** In-process tasks; Celery/Dramatiq with a broker; arq (Redis, asyncio); PostgreSQL job table with `SKIP LOCKED`; Cloud Tasks HTTP push; Temporal.

**Decision.** `agent_runs` rows are the source of truth. The API enqueues a Cloud Tasks task named after the run ID (dedupe) targeting the agent-worker. The worker claims the run with a conditional update (`queued → running`) and a 30 s lease renewed during execution. A reconciler re-enqueues stale queued runs and marks lease-expired runs `interrupted`. A PostgreSQL `SKIP LOCKED` poller implements the same `Dispatcher` interface for non-GCP environments and for scheduled jobs.

**Reasons.** No broker to operate; push model fits Cloud Run autoscaling; transactional correctness lives in PostgreSQL; portable fallback.

**Advantages.** Exactly-once *claim*; crash detection; worker autoscaling by concurrency.

**Disadvantages.** Cloud Tasks HTTP push is bounded (Cloud Run docs reference up to 30 minutes for Cloud Tasks-driven work [R8]); GCP-specific primary path.

**Consequences.** Run deadline defaults to 15 minutes; runs longer than the push limit require the poller path or Cloud Run jobs.

**Risks.** Misconfigured retries re-delivering tasks — harmless because claim is conditional.

**Revisit when.** Workflows need multi-hour/multi-day durable orchestration with human approvals (consider Temporal), or the platform moves off GCP (switch to poller or arq).

---

## ADR-006 — SSE streaming with durable event log and Valkey Streams fan-out

**Context.** The frontend already parses POST-fetch SSE (`src/lib/api/client.ts:566-625`). The prototype polls its SQLite database every 100 ms per stream and writes one transaction per token chunk (`services/runs.py:536-558, 706-732`). The previous system used in-memory queues plus database catch-up polling with `Last-Event-ID` replay (`dsai-agentic/src/APIs/sse_manager.py`).

**Problem.** Low-latency, ordered, replayable streaming across many API instances without overloading the database.

**Options.** SSE vs WebSockets; transport: DB polling, PostgreSQL `LISTEN/NOTIFY` (< 8000-byte payloads, connected listeners only [R4]), Redis/Valkey Pub/Sub (no replay), Valkey Streams (`XADD`/`XREAD BLOCK`, trimming [R10]), Kafka.

**Decision.** SSE (existing envelope). Worker assigns sequences, coalesces deltas (~50 ms), `XADD`s to a per-run Valkey stream, and batch-persists events to PostgreSQL (~250 ms / 50 events); terminal events are persisted before publication. Each API instance runs one multiplexing stream hub. Replay via `Last-Event-ID` from Valkey, falling back to PostgreSQL.

**Reasons.** Fits the existing client; standard reconnection semantics [R19]; removes per-viewer DB polling and per-token commits.

**Advantages.** Sub-200 ms fan-out target; durability; horizontal API scaling.

**Disadvantages.** Two stores for events (ephemeral + durable) with a short consistency window.

**Consequences.** Delta events compacted after completion; consumers dedupe by `(run_id, sequence)`.

**Risks.** Valkey outage — degrade to PostgreSQL tail at lower frequency.

**Revisit when.** Bidirectional real-time features (co-editing, presence at scale) are required — evaluate WebSockets for those features only.

---

## ADR-007 — Valkey for ephemeral coordination only

**Context.** Needed: live event tails, cancel/steer signals, distributed rate limits (the previous rate limiter was per-instance — `agentic-ds-backend/src/middleware/rateLimiter.ts`), short-lived caches.

**Problem.** Shared low-latency state across instances without creating a second source of truth.

**Options.** Valkey (BSD, Linux Foundation [R11]); Redis 8 (AGPLv3 option among its licences [R10b]); PostgreSQL only; Memcached.

**Decision.** Memorystore for Valkey [R17]. Nothing in Valkey is required for correctness after a restart: signals are mirrored in PostgreSQL, streams are mirrored by batched persistence, caches are rebuildable.

**Reasons.** Protocol-compatible with Redis clients; unencumbered licence for future self-hosting; managed on GCP.

**Advantages.** Low latency; atomic counters; streams.

**Disadvantages.** One more managed component.

**Consequences.** Clear rule in code review: no durable data in Valkey.

**Risks.** Memory exhaustion from untrimmed streams — enforce `MAXLEN` and `EXPIRE`.

**Revisit when.** Memory or throughput exceeds a single primary — enable cluster mode.

---

## ADR-008 — Custom thin agent orchestration with an in-process model gateway

**Context.** The previous system used LangGraph + deepagents with a supervisor and sub-agents (`dsai-agentic/src/Agent_tools/Graph.py`), adding model calls and failure modes. The prototype's single-agent loop (`server/agentic/runtime/runner.py`) already provides tools, steering checkpoints, cancellation and diagnostics, and has passed live Gemini/E2B checks (`IMPLEMENTATION_PLAN.md` Phases 4–5). Gemini SDK types currently leak into `server/agentic/agent/react_loop.py`.

**Problem.** Support multi-model, multi-step tool use with traceability and cost control.

**Options.** Custom loop; LangGraph (checkpointers, HITL [R23]); LlamaIndex; vendor agent SDKs; external gateway proxy (e.g. LiteLLM).

**Decision.** Evolve the existing loop. Introduce a provider-neutral `ModelGateway` module (adapters per provider, retries, timeouts, fallbacks, usage capture), step checkpoints in `run_steps`, compact data manifests instead of full context JSON.

**Reasons.** Smallest change that meets requirements; full control over events and cost; no framework lock-in.

**Advantages.** Testable with fake providers (existing tests do this); predictable latency.

**Disadvantages.** The team owns orchestration features that frameworks provide (graph branching, interrupts).

**Consequences.** Only the provider adapter imports a provider SDK.

**Risks.** Re-implementing framework features ad hoc — revisit trigger below.

**Revisit when.** DSAI needs multi-agent graphs, long-lived human-in-the-loop interrupts, or time-travel debugging that the loop cannot express cleanly — evaluate LangGraph with PostgreSQL checkpointers.

---

## ADR-009 — E2B sandbox per run, owned by the agent-worker

**Context.** Previously Node created sandboxes and Python connected by ID (`agentic-ds-backend/src/services/sandboxService.ts`; `dsai-agentic/src/Agent_tools/sandbox_tools.py`). The prototype creates one lazily per run and closes it at the end (`server/agentic/execution/e2b.py`). E2B plans limit concurrency (10/100/600/1,100) and session length [R14].

**Problem.** Safe code execution at scale without moving data bytes through our services.

**Options.** E2B; self-hosted microVMs (Firecracker/gVisor); local subprocess (unsafe); provider-hosted code execution tools.

**Decision.** E2B, one sandbox per run, lazily created, owned only by the agent-worker; inputs staged via signed GET URLs; outputs uploaded via signed PUT to a quarantine prefix and promoted after validation; sandbox ID stored on the run for reconciliation.

**Reasons.** Strong isolation without operating a VM fleet; existing integration and template experience.

**Advantages.** Our hosts never run untrusted code; scales with plan.

**Disadvantages.** Vendor dependency; per-second cost; plan concurrency ceiling.

**Consequences.** Admission control for code tools; sandbox metrics.

**Risks.** Vendor outage or price change — keep a `SandboxProvider` interface.

**Revisit when.** Concurrent sandboxes approach the highest plan tier or sandbox spend becomes a top-three cost — evaluate self-hosted microVMs.

---

## ADR-010 — Object storage, direct uploads, Parquet and DuckDB

**Context.** Prototype stores bytes on local disk and reads uploads fully into memory with a 25 MB cap (`server/backend/app/services/resource_uploads.py:38`); dashboard SQL runs over at most 6,000 rows in in-memory SQLite (`services/dashboard_sql.py`, `services/dataset_preview.py:66`). The previous system used presigned direct uploads to R2 and Parquet conversion. Cloud Run limits HTTP/1 request bodies to 32 MiB [R7].

**Problem.** Handle large files and full-data analytics without loading the API.

**Options.** GCS; R2 (free egress [R16]); S3; local disk. Engines: DuckDB, Polars, pandas, PostgreSQL.

**Decision.** GCS (behind an `ObjectStore` interface with an R2/S3 adapter option); signed resumable uploads from the browser; ingest jobs in the data-worker convert to canonical Parquet and precompute previews; DuckDB executes dashboard and lookup queries over full Parquet data.

**Reasons.** Bytes bypass the API; constant-time previews; columnar scans for analytics.

**Advantages.** Removes the upload size ceiling from the API path; fixes prefix-only dashboard results.

**Disadvantages.** Asynchronous readiness (UI must handle `pending` datasets — it already renders resource status).

**Consequences.** Multipart upload endpoint kept for small files during migration.

**Risks.** Egress cost at scale — measure and compare with R2.

**Revisit when.** Datasets exceed what a single data-worker instance can process (multi-GB to TB) — evaluate distributed engines or warehouse connectors.

---

## ADR-011 — Workspace tenant isolation: application checks plus PostgreSQL RLS

**Context.** The prototype checks ownership only (`services/records.py`); the previous system's role map was not indexable. RLS supports default-deny policies; owners bypass unless `FORCE ROW LEVEL SECURITY` [R3].

**Decision.** `workspace_members` table with roles; every access path goes through the `access` module; in Phase 5 enable RLS on tenant tables with transaction-scoped `SET LOCAL app.user_id`, a non-owner application role without `BYPASSRLS`, and `FORCE ROW LEVEL SECURITY`.

**Reasons.** Defence in depth against missing checks.

**Disadvantages.** Policy complexity; small query overhead; migrations need care.

**Revisit when.** Enterprise customers require physical isolation (schema- or database-per-tenant).

---

## ADR-012 — Managed OIDC identity with application RBAC

**Context.** Demo header identity today; the previous system built its own JWT/bcrypt auth with temporary users.

**Decision.** Managed OIDC provider (vendor: open question Q3); backend verifies JWTs locally via cached JWKS; users provisioned on first login; roles owner/manager/contributor/viewer per workspace.

**Reasons.** Avoids owning password, MFA and recovery flows; SSO path later.

**Disadvantages.** Vendor cost and dependency; frontend login flow changes.

**Revisit when.** Enterprise SSO/SCIM requirements exceed the vendor's capabilities or pricing.

---

## ADR-013 — Google Cloud Run, single region

**Context.** Both previous services deployed to Cloud Run `us-west1` with Cloud Build. Cloud Run: request timeout ≤ 60 min, concurrency ≤ 1,000 per instance, instance-based billing for background work, worker pools without autoscaling [R7][R7b][R8][R9b]. AWS Fargate's compute list price is lower (§18.4 of the proposal).

**Decision.** Cloud Run services for all roles (internal ingress for workers), Cloud SQL, Memorystore for Valkey, GCS, Cloud Tasks, Cloud Scheduler, Secret Manager, in one region (Q11).

**Reasons.** Team experience; least assembly; Gemini on the same cloud; managed scaling per role.

**Disadvantages.** Higher compute list price than Fargate; GCP-specific dispatcher/scheduler.

**Revisit when.** Worker fleets need custom autoscaling or long-lived connections beyond Cloud Run limits (GKE Autopilot), or a customer mandates another cloud.

---

## ADR-014 — OpenTelemetry and a usage ledger from day one

**Context.** No usage metering in the prototype; previous metrics were per-instance in memory (`metricsRegistry.ts`), while its cost logs/credit ledger were well designed.

**Decision.** OpenTelemetry traces/metrics/logs in all roles with trace propagation through dispatcher tasks; `usage_records` written per model call and per sandbox session; SLO dashboards and burn-rate alerts.

**Reasons.** Model cost dominates; quotas and SLOs need data.

**Disadvantages.** Telemetry ingestion cost — sample traces, keep metrics cheap.

**Revisit when.** Billing requirements need an external metering system.

---

## ADR-015 — Defer microservices, Kafka, Temporal, LangGraph, multi-region and self-hosted sandboxes

**Decision.** Not built now. Each has an explicit trigger:

| Deferred | Trigger to revisit |
|---|---|
| Microservice extraction | Independent team ownership, or module-specific scaling/availability that the role model cannot satisfy |
| Kafka / Pub/Sub event platform | Cross-system integrations or analytics pipelines that need a shared durable log |
| Temporal | Workflows with multi-hour waits, approvals, compensations |
| LangGraph | See ADR-008 |
| Multi-region | Contractual RTO < 1 h or data-residency requirements |
| Self-hosted sandboxes | See ADR-009 |

**Reason.** Each adds operational load that DSAI's current scale does not justify; the chosen design keeps a migration path to each.
