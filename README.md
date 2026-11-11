# DSAI

Agentic analytics workspace with a production-quality frontend foundation and a minimal modular FastAPI backend.

## Current scope
The main chat flow is connected to the FastAPI backend: the frontend loads the backend model allowlist, creates chats on first Send, streams text from Gemini, supports follow-up messages, and restores persisted messages after reload. Other product areas still use fixtures or placeholders. Uploads, resource preview/download, Queue/Steer, Quick Assistant, Tavily, E2B, SQL, and visualization tools remain pending. Disabled controls are intentional.

## Local development
Requires Node >=20.19, npm, and Python 3.11+.

Start the backend from the repository root in one terminal:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
# Add DSAI_GEMINI_API_KEY to backend/.env.
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep that process running. In a second terminal, also from the repository root:

```bash
cp -n .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000, select a model and reasoning effort, and send a message. Start both terminals in:
`/home/althafsheez/Desktop/Projects/dsai-agent-frontend`.

Backend setup and run commands are documented in [backend/README.md](backend/README.md).

## Verification
```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Credential-backed Gemini checks are opt-in:

```bash
DSAI_LIVE_GEMINI=1 backend/.venv/bin/pytest -c backend/pytest.ini backend/tests/test_live_gemini.py -q
DSAI_LIVE_GEMINI=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/live-chat.spec.ts --project=desktop
```

Playwright requires its Chromium browser installed (`npx playwright install chromium`).
Its tests launch an independent server on port 3100.
Inter is bundled locally via @fontsource-variable/inter; builds do not fetch Google Fonts.
Next.js development artifacts use .next-dev; production uses .next.

## Architecture
App Router server pages compose a client shell and small interactive components.
`src/components/ui`: shadcn-style primitives backed by Radix.
`src/components/layout`: shell, sidebar, search and placeholders.
`src/features/chat/components`: persisted chat UI and streamed message rendering.
`src/lib/api`: typed HTTP client and incremental POST-SSE parser.
`src/stores/ui-store.ts`: shared sidebar UI only.
`src/app/providers.tsx`: TanStack Query provider for backend-owned server state.
Recharts is installed for future charts but not imported into the foundation bundle.
React Flow and backend frameworks are not installed in the frontend.

See PROJECT_SPEC.md for planned directory boundaries, API_CONTRACT.md for the future backend, AGENTS.md for implementation rules, and IMPLEMENTATION_PLAN.md for phase gates.

## References
- Functional/technology: https://github.com/rohanrony/dsai-frontend
- Visual: https://github.com/AnitaGeorge404/Dsai-light-version
- Dark tokens verified from visual reference src/styles.css (blob 5ae0e2d15b7397ad0ea456ea4d3f7040883a14df).
- shadcn/ui component conventions: https://ui.shadcn.com
The user's final decisions override reference-specific routes, fonts and framework choices.

If Google Chrome is already installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` instead of downloading a browser.

Dependency overrides pin Next's PostCSS to the patched 8.x release and TypeScript ESLint's minimatch to a compatible patched release. These keep Next.js 15 while resolving installation audit findings. Recheck these overrides when upgrading framework/tooling.
