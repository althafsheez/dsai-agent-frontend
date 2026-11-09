# Codex instructions — DSAI

Read PROJECT_SPEC.md, API_CONTRACT.md and IMPLEMENTATION_PLAN.md before implementation. The user's final decision record dated 2026-11-09 supersedes earlier draft-upload, deferred-steering and output-only artifact assumptions.

## Project and references
- Work only in /home/althafsheez/Desktop/Projects/dsai-agent-frontend.
- The old Documents prototype was removed. Do not restore it or copy its configuration.
- Technology/functionality reference: https://github.com/rohanrony/dsai-frontend
- Visual reference: https://github.com/AnitaGeorge404/Dsai-light-version
- Preserve dark charcoal, Inter, compact spacing and restrained borders. Inspect reference source; do not claim pixel accuracy without visual comparison.

## Required architecture
- Next.js 15 App Router, React 19, strict TypeScript, Tailwind CSS 3, shadcn/ui + Radix UI, Lucide.
- TanStack Query owns fetched data. Zustand owns genuinely shared UI state only. Local React state owns local interactions and active streamed text. Never duplicate server records in Zustand.
- Use Recharts for structured chart data; defer React Flow until workflow implementation.
- FastAPI, SQLAlchemy, SQLite, one Gemini agent, E2B Code Interpreter, local storage in backend/.
- Central typed API and POST fetch SSE parser; no fetch in presentation components or provider credentials in browser code.
- Prefer server components; scope client providers and interactions. Small feature-based components, modular message renderers, lazy heavy previews/charts, accessible primitives, responsive layouts.
- Use Vitest/React Testing Library and Playwright for critical flows. Do not add unnecessary frameworks, infrastructure, abstractions or dependencies.

## Product invariants
- One chat model, nullable workspace_id, one /chat/[chatId] route. Moving a chat preserves its ID, messages, runs and resources; chat datasets do not become workspace-shared.
- First Send creates the chat. Unsent files remain in browser memory. Create chat -> upload/register files -> start run. No draft-upload backend.
- Classify by purpose: CSV/Excel/Parquet structured files are Datasets, including generated files. Images/charts/PDFs/reports are Artifacts, including uploaded files.
- Store files once with stable IDs; resource links define scope; favorites are references. Soft-delete chats/workspaces only; archive each independently.
- Persist messages, public execution details and outputs progressively. Never fabricate private model reasoning or expose secrets in traces.
- Queue persists a new message and executes after current completion. Steer is functional at safe agent checkpoints. Show both only while running and composing.
- Leaving chat or refresh cancels the run, preserves progress, clears pending automatic work appropriately; no background runs or automatic stream reconnection.
- Retry starts a new run against the original user message. Never duplicate the user message.
- Context and file preview are mutually exclusive right-panel modes. Dataset groups are Workspace and Chat Datasets.
- Quick Assistant is an independent read-only conversation, not the main run; no execution tools or file mutations.
- Use stable predefined demo users behind useAuth(). Real backend model allowlist and supported efforts; no fake model aliases.
- E2B outputs only under /home/user/outputs/. Validate resolved paths, ownership, types, limits and output deduplication.

## Workflow
Implement sequential phases from IMPLEMENTATION_PLAN.md. Finish and verify a phase before advancing; record partial/blocked checks honestly. Use explicit fixtures until endpoints exist and label preview states. Do not claim real Gemini/E2B success from mocks. Run relevant typecheck, lint, build, unit and browser checks. No application-wide refactors for isolated bugs. Keep source readable and report the current verified phase.

