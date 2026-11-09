# DSAI — final product specification
Decision baseline: user's final architecture and product decisions, 2026-11-09.

## Goal and stack
Agentic data analytics with a production-quality frontend and a minimal, functional, replaceable backend.
Next.js 15 App Router, React 19, strict TypeScript, Tailwind CSS 3, shadcn/ui + Radix UI, Lucide, TanStack Query, Zustand for shared UI, Recharts, SSE over fetch. React Flow only when workflows are implemented. Vitest + React Testing Library; Playwright for critical flows.
FastAPI, SQLAlchemy, SQLite, single Gemini agent, E2B Code Interpreter, local filesystem. No Redis, Celery, Kafka, multi-agent framework, microservices or workflow engine.

References: [technology/functionality](https://github.com/rohanrony/dsai-frontend); [visual design](https://github.com/AnitaGeorge404/Dsai-light-version).
Use the visual reference's dark charcoal CSS tokens, explicitly loaded Inter, warm off-white text, neutral borders, compact rows and muted sage/slate accents. Adapt its styling to Tailwind 3; do not import its Vite/TanStack Router framework.

## Structure
```text
src/
  app/
    layout.tsx, globals.css, providers.tsx
    (auth)/login/page.tsx
    (app)/
      layout.tsx, page.tsx
      chat/[chatId]/page.tsx
      workspaces/page.tsx, workspaces/[workspaceId]/page.tsx
      history/page.tsx, library/page.tsx, connectors/page.tsx
      dashboards/page.tsx, workflows/page.tsx, settings/page.tsx
  components/
    ui/                     # shadcn/Radix primitives
    layout/                 # shell, sidebar, search, context header
  features/
    auth/                   # centralized demo identity/useAuth
    chat/                   # composer, renderers, navigation, run controller
    workspaces/
    history/
    datasets/
    artifacts/
    library/
    quick-assistant/
  lib/
    api/                    # DTOs, HTTP client, fetch SSE parser
    mocks/                  # explicit typed development fixtures/adapters
    utils.ts
  stores/                   # shared client UI only
tests/e2e/
backend/
  app/
    main.py, config.py, db.py, models.py, schemas.py
    routes/
    services/               # storage, resource classification, access
    agent/                  # Gemini runner, run coordinator, E2B tools
  tests/
  storage/                  # ignored, durable local files
  requirements.txt
public/
```
Create directories when needed. Keep route composition separate from business rules, API operations and run state. TanStack Query caches backend data; do not mirror it in Zustand. Avoid giant components, unnecessary effects/client boundaries and rerendering completed messages for every streamed token.

## Routes and global shell
- /: New Analysis with sidebar, centered welcome heading, composer and optional suggestions; no right sidebar.
- /login: predefined demo user selector, no password flow. Stable SQLite user IDs behind useAuth(); demo identity can be replaced later. Demo authentication is not production security.
- /chat/[chatId]: shared standalone/workspace chat, header, conversation rail, conversation, composer, contextual right panel.
- /workspaces: generic list/create. /workspaces/[workspaceId]: chats and workspace datasets; direct workspace uploads.
- /history: chats and workspaces only.
- /library: saved artifact references across accessible contexts.
- /connectors: functional upload when backend exists; other connectors marked coming soon.
- Dashboards/Workflows navigation and placeholders; full builders deferred.

Sidebar: logo/name, search icon, collapse control, New Analysis. Exact nav order: Recent Analyses, Workspaces, Dashboards, Workflows, Library, Connectors. First four have compact recent-item hover flyouts, also keyboard-accessible; click navigates. Collapsible Pinned and Activity below. Avatar/name/settings footer. No inline expanded recent list. Approximately 240px expanded, 56px collapsed; mobile drawer and readable focus styles.

Header: standalone = chat title; workspace chat = folder icon + clickable workspace name > chat title; workspace overview = folder icon + workspace name. Share and right-panel toggle on chat header; sharing may be visibly unavailable until implemented.

## History and workspace lifecycle
Search above one toolbar: Owned/All, Active/Archived, Filters popover, Recent sort. Popover: time, author, workspace. Columns: Name, Workspace, Author, Updated. Author is creator; no Owner column. Owned and Active default; All is accessible records only. Sort updated descending, paginate, preserve filters in URL.
Chats and workspaces archive independently. Archived parent does not archive children. Soft delete uses deleted_at; hide deleted records from normal lists/history but preserve all data. Children of a deleted workspace remain preserved; hide its contextual navigation until recovery exists.
Chat workspace_id is nullable. Moving standalone chat updates membership only; retain ID/history/files and chat dataset scope. No dataset-moving UI.

## Composer and uploads
Standalone/draft actions: + menu, Folder, separate Model and Effort selectors, Mic, Send. Workspace chat hides Folder. + menu: Upload file, Add dataset, Connect source, Add skill; only implemented options enabled.
File previews show thumbnails or filename/type/size, remove and per-file failure/retry. Multiple files supported. Files remain browser File objects until Send; selecting workspace only changes draft context.
First Send creates chat with first message, then uploads/registers each file, then starts agent. Start only when selected uploads succeed or user explicitly removes a failed file. Preserve successful registrations and retry failed files without duplicate records. Hide incomplete first-send chats from History until at least the first run is accepted, avoiding empty History rows. See API_CONTRACT.
CSV/Excel/Parquet and structured tables -> Dataset. Images/charts/PDF/reports and other supported non-structured files -> Artifact. This applies to uploads AND generated outputs. Same physical file is never copied merely to save/link it.
Model and efforts come from actual configured Gemini allowlist/metadata, validated by backend. Apply selection per query; reset new queries to configured defaults. No complex preference persistence.

## Chat rendering and execution
Modular user bubble, assistant Markdown, code/SQL, tables, charts, images, file cards, execution details, errors and Retry. Interactive Recharts only with structured validated data; responsive tooltips and expansion. Static PNG/JPEG charts inline; never reconstruct data from pixels or execute generated HTML/JS.
Persist and stream provider-exposed reasoning summaries (when available), progress, tool calls/arguments/results, statuses, errors, intermediate files/datasets, and final response. No private chain-of-thought fabrication; redact secrets, cap displayed payloads, expose safe detail previews.
Conversation navigator lives inside main chat, not a separate sidebar: one gray horizontal marker per question/response; hover question/answer preview/time, click scroll, IntersectionObserver active indicator.
Queue/Steer appear only while main run is active and composer has input. Queue saves message and runs automatically afterward; durable ordering. Steer sends instruction to current run and applies between iterations/tool calls, without restarting conversation. Distinguish received/applied/unapplied steering. No promise to interrupt an already executing tool.
Refresh/navigation away aborts stream and requests cancellation; server attempts provider/E2B cancellation and marks interrupted run, preserving progress. No background execution or automatic reconnection. On restart, stale active runs become interrupted.
Retry creates a new run referencing original user message; preserve prior traces and files and do not duplicate that message. Gemini title from first user message with first-50-character fallback; manual rename takes precedence over late generation.

## Context and previews
Right panel has exactly one mode: closed, context, file preview.
Context: Datasets/Artifacts tabs plus independent Quick Assistant. Workspace Datasets and Chat Datasets groups are collapsible; standalone shows Chat Datasets only. Workspace data available to all its chats, chat data stays scoped after moving.
Artifact list includes uploaded and generated non-dataset files. Save/star adds reference to global Library; unstar removes reference only, no physical file deletion. Library differs from Pinned navigation.
Click a file opens right preview; Back returns to context; Close closes panel. Dataset preview: name, counts, column names/types, first 50–100 rows, download. Server limits preview; never download full large tables to browser just for preview. Images/PDFs preview when supported; other files show metadata/download.
Quick Assistant: separate conversation scoped to current context, read-only explanations, no analytical execution tools or mutation; separate state/run from main agent.

## Backend and files
Separate user, workspace, chat, message, resource, resource-link, favorite, run and event records. SQLite stores metadata, filesystem stores bytes. Generated storage IDs independent of filenames; browser gets authorized endpoints, not filesystem paths.
Reuse available suitable single-agent code or build a simple runner. Tools inspect datasets, execute Python in one E2B sandbox reused within the run, produce files, collect outputs. Sync supported files from /home/user/outputs after tool execution and at finalization, preserving intermediate versions. Validate real paths, symlinks, file types and limits. Deduplicate by run/path/content version and store bytes once; classify tables as datasets and charts/documents as artifacts.
Credentials backend-only. Persist progressively and finalize all terminal paths. Queue/Steer require a small in-process run coordinator plus SQLite records, no external worker infrastructure.

## Required end-to-end acceptance
New Analysis -> select/create workspace -> attach multiple CSVs (browser only) -> Send -> create chat -> upload/register chat-scoped datasets -> Gemini stream + persisted tool trace -> E2B Python -> chart AND intermediate table -> register chart as artifact and table as dataset -> render chart inline -> contextual resources -> preview/download -> star/unstar Library -> reopen via History and restore messages/events/files.
Also: standalone chat -> move to workspace -> same ID/messages/datasets/artifacts; queue during run -> automatic next execution; steer -> applied at checkpoint; refresh/leave -> interrupted run preserved; retry -> new run without duplicate question; workspace archive does not archive chats; soft delete preserves stored files.

## Deferred
Real password/multi-user production auth, sharing flows/live collaboration, external connectors, advanced dashboard/workflow builders, skills management, background execution/reconnection, voice transcription. Quick Assistant, Queue, checkpoint Steer, multi-file registration and file previews are required MVP work, not deferred.

