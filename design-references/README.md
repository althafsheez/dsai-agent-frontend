# DSAI design references

This folder is the source of truth for visual implementation of the four frontend pages: **Landing**, **Authentication**, **History**, and **Chat**.

## Original reference repositories
- Visual reference: [AnitaGeorge404/Dsai-light-version](https://github.com/AnitaGeorge404/Dsai-light-version), especially [src/styles.css](https://github.com/AnitaGeorge404/Dsai-light-version/blob/main/src/styles.css). Its name says "light" but its root palette in the inspected stylesheet is **dark charcoal**.
- Functional/technology reference: [rohanrony/dsai-frontend](https://github.com/rohanrony/dsai-frontend), if accessible.

## Read before implementing
1. [GLOBAL_DESIGN_SYSTEM.md](GLOBAL_DESIGN_SYSTEM.md) — exact source design tokens, typography, layout and component styling.
2. [PAGE_WIREFRAMES.md](PAGE_WIREFRAMES.md) — intended layouts, interactions and page-specific behavior.
3. [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) — page boundaries and ownership rules for parallel Codex agents.

## Screenshot references
Screenshots were shared in ChatGPT, but **have not been uploaded as binary image files to this repository**. When available, add these under `design-references/screenshots/`: `sidebar.png`, `chat-layout.png`, `chat-header.png`, `chat-composer.png`, `history.png`. Do not treat a screenshot description as proof of its exact pixels.

**Rule:** Keep one unified design system, not a new styling scheme for each page. Do not copy Tailwind 4-specific `@theme` or `@utility` syntax directly into a Tailwind 3 app. Convert the source palette to compatible CSS variables and Tailwind configuration.
