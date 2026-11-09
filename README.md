# DSAI

Production-quality frontend foundation for an agentic analytics workspace.

## Current scope
Phase 1 only: dark reference tokens, self-hosted Inter, responsive shared shell, compact navigation, search dialog, New Analysis draft, and placeholder routes. No agent, uploads, authentication, data persistence or backend is implemented yet. Disabled controls are intentional. No fake model responses.

## Local development
Requires Node >=20.19 and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Start in this directory:
`/home/althafsheez/Desktop/Projects/dsai-agent-frontend`.

## Verification
```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright requires its Chromium browser installed (`npx playwright install chromium`).
Its tests launch an independent server on port 3100.
Inter is bundled locally via @fontsource-variable/inter; builds do not fetch Google Fonts.
Next.js development artifacts use .next-dev; production uses .next.

## Architecture
App Router server pages compose a client shell and small interactive components.
`src/components/ui`: shadcn-style primitives backed by Radix.
`src/components/layout`: shell, sidebar, search and placeholders.
`src/features/chat/components`: local welcome composer.
`src/stores/ui-store.ts`: shared sidebar UI only.
`src/app/providers.tsx`: TanStack Query provider for upcoming server state.
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

