# DSAI — Redesigned MVP Frontend

DSAI is an enterprise-grade agentic data analytics application designed for fast, conversational analysis of structured datasets (CSV, Excel, Parquet), interactive visualizations, and automated workflows.

## Current scope
The main chat uses the ReAct agent in `server/agentic/agent/react_loop.py`. The existing FastAPI endpoint supplies conversation history and authorized tools, persists run events and streams responses to Next.js. Edit the shared loop in `server/agentic/` to change how chat chooses tools and synthesizes answers. Run the API and frontend together as shown below.
This repository hosts the redesigned Next.js 15 frontend MVP, rebuilt with an understated dark charcoal design system, responsive application navigation, structured chat execution trace, and rich context inspection.

---

## Design System & Brand Identity

The redesign adheres strictly to the unified DSAI design specifications:

- **Color Tokens**: Dark charcoal surfaces with high contrast text and restrained hairline borders:
  - `--surface`: `oklch(0.18 0.005 260)`
  - `--surface-2`: `oklch(0.22 0.006 260)`
  - `--surface-3`: `oklch(0.26 0.008 260)`
  - `--raised`: `oklch(0.24 0.008 260)`
  - `--border-strong`: `oklch(0.35 0.01 260)`
  - Accents: Sage (`oklch(0.72 0.08 155)`), Slate (`oklch(0.78 0.07 258)`), Navy (`oklch(0.32 0.06 260)`), Destructive Red (`oklch(0.63 0.22 25)`).
- **Typography**: Explicitly loaded Inter font with tight letter-spacing (`tracking-tight`), restrained heading scales (`text-2xl` to `text-3xl`), and no unstyled oversized serif headers.
- **Brand Identity**: Monogram badge and faceted geometric DSAI logo replacing legacy placeholder branding.

---

## Implemented Pages & Features

1. **Global Application Shell (`src/components/layout`)**
   - **App Sidebar**: Navigation order: *Recent Analyses*, *Workspaces*, *Dashboards*, *Workflows*, *Library*, *Connectors*.
   - **Hover Flyouts**: Quick-access cards for recent analyses and workspaces with relative timestamps and direct links.
   - **Pinned & Activity**: Collapsible pinned favorites and live background task indicator.
   - **Search Dialog (`⌘K` / `Ctrl+K`)**: Global accessible quick-switcher for workspace routes and pages.
   - **Demo User Footer**: Active demo profile switcher with immediate access to identity preferences.

2. **Welcome & First-Send Landing (`/`)**
   - Centered Inter welcome header (`Welcome back` / `What would you like to analyze?`).
   - "Continue where you left off" and "Pinned" cards with metadata, author, and relative dates.
   - First-send composer with file attachments, multi-model dropdown, reasoning effort selector, and suggested prompts.
   - First-send invariant: Chat creation occurs on first Send, uploading local attachments before triggering the agent run.

3. **Authentication Flows (`/login`, `/signup`, `/forgot-password`)**
   - Clean, minimal auth layout without sidebar distraction.
   - Demo user quick-switcher (`Yusuf`, `Anita`, `Demo Analyst`) integrated with `useAuth()`.
   - Honest indicator for disabled third-party SSO buttons.

4. **History & Workspace Management (`/history`, `/workspaces`)**
   - **History Table**: Segmented controls (*Owned* / *All*, *Active* / *Archived*), search input, sorting, and filter popover (time, author, workspace).
   - **Workspaces Directory**: Filterable list of accessible workspaces with author, created date, and action popover (Open, Copy link, Delete).
   - **Workspace Detail View (`/workspaces/[id]`)**: Full workspace overview with tabs for *Chats*, *Datasets* (with schema inspector), *Workflows*, and durable Markdown *Context* files.
   - **Access & Transfer Dialogs**: Member sharing role manager and guarded ownership transfer with safety confirmation.

5. **Conversational Analysis (`/chat/[id]`)**
   - **Header**: Breadcrumb navigation (Standalone chat vs. `Folder / Workspace > Chat Title`), right panel toggle (`◧`), and share action.
   - **Composer**: Model selector, reasoning effort selector, workspace assigner, and in-run action controls.
   - **Run Queue & Steering**: Functional Queue persists next instruction; Checkpoint Steering allows guiding execution mid-run.
   - **Assistant Message Renderers**: Execution trace with status badges, collapsible tool calls, syntax-highlighted code blocks, interactive data tables, and Recharts visuals.
   - **Conversation Navigator**: Minimalist progress rail with question/response markers, active viewport tracking, and scroll-to-turn.
   - **Right Panel (Mutually Exclusive)**: Datasets & Artifacts contextual groups, schema inspection, download links, and read-only Quick Assistant.

6. **Library (`/library`)**
   - Saved artifacts and datasets catalog with category filters (*All*, *Datasets*, *Reports*, *Visuals*, *Code*).
   - Dynamic thumbnail generation, code preview snippet overlays, and grid/list layout toggles.
   - Slide-out file preview panel and direct file download support.

7. **Dashboards & Workflows Previews (`/dashboards`, `/workflows`)**
   - Aligned to dark charcoal styling with filterable cards, pinned state, trigger indicators, and honest preview notices.

8. **Connectors & Settings (`/connectors`, `/settings`)**
   - Catalog of analytical skills, database sources, and productivity integrations.
   - Full settings overview: Profile preferences, role selector, Gemini API backend status, authentication review, and storage plans.

---

## Local Development

### Prerequisites
- Node.js >= 20.19
- npm >= 10.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/althafsheez/dsai-agent-frontend.git
cd dsai-agent-frontend

# Install dependencies
npm install

# Set up the API and its environment (then add provider keys to server/backend/.env)
python3 -m venv server/backend/.venv
server/backend/.venv/bin/python -m pip install -r server/backend/requirements.txt
cp -n server/backend/.env.example server/backend/.env

# Start the API in one terminal and the frontend in another
npm run dev:backend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. See [server/backend/README.md](server/backend/README.md) for API configuration and backend tests.

---

## Quality Assurance & Verification

The codebase maintains strict quality gates with zero warnings and zero TypeScript errors:

```bash
# 1. Typecheck
npm run typecheck

# 2. Linting (zero tolerance)
npm run lint

# 3. Unit & Integration Tests (Vitest)
npm test

# 4. Production Build
npm run build
```

### Verification Results
- **TypeScript**: `tsc --noEmit` passed with 0 errors.
- **ESLint**: `eslint . --max-warnings=0` passed with 0 warnings.
- **Vitest Suite**: 55/55 tests passed across 23 test files (100% pass rate).
- **Next.js Production Build**: All 14 routes statically and dynamically compiled with optimized chunk sizes.

---

## References & Guidelines
- Functional & Technical Reference: [dsai-frontend](https://github.com/rohanrony/dsai-frontend)
- Visual Reference: [Dsai-light-version](https://github.com/AnitaGeorge404/Dsai-light-version)
- Specifications: See `PROJECT_SPEC.md`, `API_CONTRACT.md`, and `IMPLEMENTATION_PLAN.md`.
