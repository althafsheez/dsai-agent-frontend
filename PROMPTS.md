# Phase prompts
Read AGENTS.md, PROJECT_SPEC.md, API_CONTRACT.md and IMPLEMENTATION_PLAN.md first. The 2026-11-09 finalized decisions supersede earlier prompts.

1. Foundation: Next 15, React 19, Tailwind 3, strict TS, dark tokens, Inter, shared shell/sidebar, welcome and placeholder routes only. Run lint/typecheck/build and relevant UI checks. Stop after foundation.
2. UX: shared chat/workspace interface, mock History, demo identity abstraction, local draft attachments, navigator, panel modes and Library UI. Label mocks; retain chat identity and scope.
3. Persistence: minimal FastAPI/SQLAlchemy/SQLite, predefined users, upload-on-Send, per-file registration, structured inputs as datasets and non-structured inputs as artifacts, previews/downloads, Library references, independent archive and soft delete.
4. Gemini: single agent, real model allowlist, progressive messages/events, durable Queue, checkpoint Steer, navigation/refresh cancellation, nonduplicating Retry, independent read-only Quick Assistant.
5. E2B: multiple datasets, Python, output syncing with intermediate versions, generated structured data -> Datasets, images/charts/documents -> Artifacts. Verify real outputs and path restrictions.
6. Demo gate: test critical flow in IMPLEMENTATION_PLAN.md, fix confirmed defects, report actual verified behavior and missing credentials. Never claim mocked tests prove real provider integration.

Each phase must pass its relevant checks before being marked DONE. Implement only the phase currently requested.

