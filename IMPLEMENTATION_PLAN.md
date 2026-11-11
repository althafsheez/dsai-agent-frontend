# DSAI implementation plan
Updated 2026-11-09 from final user decisions. Implement and verify sequentially. No compressed time promises. Only mark DONE with actual checks. Current task proceeds into Phase 1; later phases remain tracked explicitly.

## Phase 0 — Inspect and reconcile — DONE
- Inspected new Desktop project: five documents, no application code or Git metadata.
- Confirmed old Documents prototype removed; new project is authoritative.
- Read final decision record and reconciled all four core documents.
- Inspected technology reference package.json and visual reference src/styles.css; preserve URLs.
- Required stack: Next 15 / React 19 / Tailwind 3; do not inherit reference tooling blindly.

## Phase 1 — Frontend foundation — IN PROGRESS
- Scaffold strict TS, Next 15 App Router, Tailwind 3, shadcn/Radix primitives, loaded Inter, shared tokens.
- Shared responsive shell, sidebar collapse/mobile drawer, search, nav/flyouts, Pinned/Activity, footer.
- Welcome composer presentation with local draft text and suggestions; other pages remain honest placeholders.
- Route placeholders clearly labeled, no fake API/model/run capability.
- Central API boundary documented; TanStack Query provider; Zustand UI state. No invented backend requests.
- Vitest/RTL and Playwright setup; gates: typecheck, lint, unit/component tests, build, browser smoke at desktop/mobile, keyboard dialogs/history navigation.
- Acceptance: /, /history, /login and placeholders render; sidebar collapses, search navigates and suggestions populate local drafts. No backend or Gemini/E2B claims.

## Phase 2 — Chats, workspace and resources UX — PENDING
- Demo-user selector/useAuth and mock History with URL filters, pagination and ownership/status states.
- Workspace list/create/details and one shared chat page; mock data through API-shaped adapter.
- First-send draft context/files stay in browser; chat created only on submission. Mock move retains identity.
- Reusable composer, modular renderers, navigable rail with IntersectionObserver.
- Mutually exclusive context/file preview; workspace/chat dataset groups; artifact saving UI; independent Quick Assistant UI.
- Queue/Steer mock lifecycle explicitly simulated; loading/errors/empty/retry/attachment failure UX.
- Gates: component tests for draft context, scope, panel modes and retry; Playwright new chat -> move -> History and file preview. Mock label visible.

## Phase 3 — Backend persistence and real files — PENDING
- Verified partial foundation on `codex/backend-foundation`: FastAPI/SQLAlchemy/Alembic, demo ownership, workspaces, chats, ordered messages, Gemini provider boundary, text SSE runs, progressive events, cancellation checkpoints, retry identity, safe local byte storage, and frontend HTTP integration for text chat. This does not complete Phase 3: upload/preview/download, resource APIs, History, archive/delete lifecycle, and Library remain pending.
- FastAPI + SQLAlchemy/SQLite; demo identities/access; typed routes and DTO parity.
- Chats/workspaces lifecycle, independent archive, soft delete, pagination, title fallback.
- Upload-on-Send orchestration, per-file idempotency and partial failures; CSV/Excel/Parquet inspection, image/PDF artifact registration, local file objects, preview/download.
- Library reference saving; progressive message/event/run models; frontend switches implemented operations from fixtures.
- Gates: API tests for no pre-send record, partial upload retry, scope after move, 100-row cap, favorite no copies, independent archive/soft delete, access failures and refresh persistence.

## Phase 4 — Gemini runs, queue and steering — PENDING
- Verified partial text-chat slice: backend model discovery, functional model/effort selection, first and follow-up POST-SSE runs, progressive rendering, persisted reload, deterministic SSE parsing, and credential-backed Gemini/browser checks. Queue, steering, title generation, Quick Assistant, and the remaining lifecycle gates are not implemented.
- Single Gemini runner, allowlisted model/effort metadata, title generation with manual-rename protection.
- Incremental fetch SSE + progressive DB events/text; tool/summary/error renderers.
- Per-chat run coordination, durable queue ordering, safe-checkpoint steering and received/applied/unapplied statuses.
- Abort on navigation/refresh; cancelled/interrupted statuses, startup stale-run reconciliation.
- Retry reuses original question; independent read-only Quick Assistant.
- Gates: deterministic runner/SSE tests for split chunks, race/cancel/retry/queue/steer; actual credential-backed Gemini response, title and explanation when keys configured. No fake model names.

## Phase 5 — E2B and output rendering — PENDING
- Inspect multiple dataset inputs, execute Python in per-run E2B, sync outputs after tool checkpoints.
- Preserve/dedup intermediate versions; CSV/Excel/Parquet -> Dataset, images/charts/reports -> Artifact.
- Inline image/chart/file renderers, validated Recharts specification, expand, preview, download, Library.
- Gates: output path escape rejection, duplicate scans, modified output versions, sandbox errors/cancellation and provider cleanup; real Gemini/E2B chart plus intermediate CSV persisted and downloadable.

## Phase 6 — End-to-end demo gate — PENDING
- Playwright critical flows plus API/unit tests; production build/typecheck/lint.
- Desktop/mobile layout and keyboard testing; verify static history is isolated from streamed rerenders.
- Exercise real demo below and failure branches. Report mock-only evidence separately.
- Document run commands/environment, actual checks, remaining limitations and unavailable credentials.

## Critical demo
1. New Analysis; create/select generic workspace.
2. Attach two CSVs; only local previews before Send.
3. Send -> create chat/initial message -> upload/register -> execute Gemini.
4. Live persisted text + execution events; Python in E2B.
5. Generate chart and intermediate structured output; register automatically in separate categories.
6. Inline chart + Workspace/Chat datasets + Artifacts.
7. Right preview/Back/Close; file download; star/unstar global Library.
8. Reopen History and restore messages, events and resources.
9. Create standalone chat, move it: ID/messages/artifacts/datasets unchanged and datasets still chat-scoped.
10. Queue a follow-up during a run and verify automatic execution; steer another run and verify checkpoint application.
11. Refresh/navigate away: interruption recorded, completed progress preserved; Retry creates run without duplicating question.
12. Independently archive/restore chat/workspace; soft-delete hides records and preserves files.

## Known prerequisites
No backend code, reusable runner, credentials or runtime state existed in the new project at inspection. Obtain runtime keys through backend environment during integration, never commit them. Phase 1 does not need provider keys. Real provider acceptance cannot pass with mocks alone. Demo auth is local/demo only; sharing/voice/external connectors/builders remain explicitly deferred.
