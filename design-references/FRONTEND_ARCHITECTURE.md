# Frontend architecture and parallel Codex implementation rules

## Locked frontend technologies
Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS 3, shadcn-style/Radix components, Lucide React, TanStack Query for server state, Zustand sparingly for shared UI state, Recharts for chart components. Do not load React Flow until the Workflows feature is implemented. Use SSE over fetch when backend streaming is later integrated.

## Layout and directory boundaries
```text
src/
  app/
    (auth)/login/page.tsx
    (auth)/signup/page.tsx
    (auth)/forgot-password/page.tsx
    (app)/layout.tsx          # persistent app shell + global sidebar
    (app)/page.tsx            # landing
    (app)/history/page.tsx
    (app)/chat/[chatId]/page.tsx
  components/
    layout/                   # shell, global nav, shared header
    ui/                       # shared Radix/shadcn primitives
  features/
    landing/
    auth/
    history/
    chat/
      components/             # navigator, messages, composer, renderers, right sidebar
  lib/
    api/                      # single typed API interface
    mock/                     # localStorage demo adapter implementing API interface
  types/
```

Keep route files thin. Only the app shell is responsible for global sidebar. Auth pages must be outside app shell. Chat and workspace-associated chat use the **same** route `/chat/[chatId]` with nullable `workspaceId`.

## Frontend quality rules
- Minimize `use client` scope; isolate input and simulated streaming state so the global shell does not rerender on each token.
- Keep server-originated data in TanStack Query, not duplicated in Zustand. Use Zustand only where components truly share transient UI state.
- Typed schemas/interfaces for users, workspaces, chats, messages, attachments, datasets, artifacts, and agent events.
- Centralize mutations through typed API/mock layer; don't put `localStorage` calls throughout components.
- Lazy-load Recharts and heavy file previews; keep static message rows stable.
- Semantic HTML, accessible keyboard interactions, visible focus states, escape key and click-outside on popovers.
- Loading, empty, error and retry states; validate persisted mock data. No unsafe file handling.
- Keep CSS tokens and spacing coherent; don't make per-page duplicate themes.

## Parallel branch rules
1. Finish one foundation commit containing theme, shell, shared UI primitives, API/mock interfaces and empty routes before branching.
2. Then work on four independent Git worktrees/branches: `feat/landing`, `feat/auth`, `feat/history`, `feat/chat`.
3. Page agents own only their feature folder and corresponding route files. **Do not edit** globals.css, tailwind config, package.json, shared components, shared mock contracts, or AppShell on feature branches.
4. Missing shared contract? Report it for integration rather than implementing a contradictory local version.
5. Commit on each branch and merge sequentially. After merge, run TypeScript, lint, production build and browser smoke tests.
6. Backend is **deferred**; any future FastAPI/SQLite work belongs in `backend/` with stable API contracts and no frontend page rewrites.

## Concrete mock behavior
- Selecting files in New Analysis: preview in browser; on first send create chat, register mock attachment metadata, save prompt, navigate to chat.
- History: search/filter chats and workspaces, including Owned/All and Active/Archived; persist demo changes in one adapter.
- Chat: mock streaming and agent progress events clearly designated demo, queue/steer simulation, file previews and favorites.
- Demo auth: no real security guarantees; real auth later replaces adapter.
