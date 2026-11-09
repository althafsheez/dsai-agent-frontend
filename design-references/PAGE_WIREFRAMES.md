# Four page wireframes and behaviors

All wireframes are structural references. Actual spacing, colors and typography come from [GLOBAL_DESIGN_SYSTEM.md](GLOBAL_DESIGN_SYSTEM.md).

## 1 — Landing / New Analysis (`/`)

```text
┌──────────────────────────┬─────────────────────────────────────────────────┐
│ DSAI                ⌕ ◧  │                                                 │
│ + New Analysis           │                                                 │
│ Recent Analyses          │                                                 │
│ Workspaces               │                 Welcome back                    │
│ Dashboards               │         What would you like to analyze?        │
│ Workflows                │                                                 │
│ Library                  │       ┌──────────────────────────────────┐      │
│ Connectors               │       │ attachment thumbnails/cards      │      │
│                          │       │ Ask anything about your data...  │      │
│ ▾ PINNED                 │       │ +  Folder  Model  Effort  Mic Send│      │
│ ▾ ACTIVITY               │       └──────────────────────────────────┘      │
│                          │      [Analyze data] [Explore dataset]           │
│ User                 ⚙   │                                                 │
└──────────────────────────┴─────────────────────────────────────────────────┘
```

Shared left sidebar has header logo/search/collapse, + New Analysis, navigation in **this order**: Recent Analyses, Workspaces, Dashboards, Workflows, Library, Connectors; hover flyouts for first four; collapsible Pinned and Activity; user/settings footer.
Composer: attachments preview before send (files retained in browser); + opens Upload File, Add Dataset, Connect Data Source, Add Skill; folder selector chooses workspace; independent Model and Reasoning Effort selectors; mic and Send. A chat is **created on first Send**, never on opening the page. Workspace choice before send sets new chat workspaceId. No right context sidebar.

## 2 — Auth (`/login`, `/signup`)

```text
┌──────────────────────────────────────────────────────────────┐
│ DSAI                                                         │
│                                                              │
│                        Welcome back                          │
│                      Sign in to continue                     │
│                   ┌───────────────────────┐                  │
│                   │ Email address         │                  │
│                   │ [                   ] │                  │
│                   │ Password              │                  │
│                   │ [                   ] │                  │
│                   │        Forgot password│                  │
│                   │ [      Sign in      ] │                  │
│                   │          OR           │                  │
│                   │ [ Google (unavailable)]│                  │
│                   │ New here? Sign up     │                  │
│                   └───────────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

No left sidebar. Minimal centered form, compact typography and spacing, demo auth only; working demo user selector/session is acceptable. Never claim Google OAuth is functional when it is not. Signup analogous, and Forgot Password simple demo page. Shared visual tokens.

## 3 — History (`/history`)

```text
┌───────────────────┬────────────────────────────────────────────────────────┐
│ GLOBAL SIDEBAR    │ History                                                │
│                   │ View and manage your chats and workspaces              │
│                   │ [ Search chats and workspaces...                     ] │
│                   │ [ Owned | All ] [ Active | Archived ] [Filters] [Recent]│
│                   │                                                        │
│                   │ NAME             WORKSPACE      AUTHOR       UPDATED   │
│                   │ Revenue Analysis  Research       You          2h ago   │
│                   │ Sales Forecast    Standalone     Anita        5h ago   │
│                   │ Project Alpha     —              You          1d ago   │
└───────────────────┴────────────────────────────────────────────────────────┘
```

Only **Chats and Workspaces**, not dashboards/workflows. Two independent segmented controls: Owned (default) / All; Active (default) / Archived. **One Filters popover** with Time, Author, Workspace, not another row of filter chips. Table has Name, Workspace, Author (creator), Updated. Workspace rows show em dash in Workspace column, standalone chats say Standalone. Recent updated descending default, search, soft delete, rename, archive/restore, compact row actions. No separate Owner column and no Shared tab.

## 4 — Chat (`/chat/[chatId]`)

```text
┌─────────────┬─────┬────────────────────────────────────────┬───────────────────────┐
│ GLOBAL      │ Q   │ Folder / Workspace > Chat    Share  ◧ │ CONTEXT               │
│ SIDEBAR     │ NAV ├────────────────────────────────────────┤ [Datasets] [Artifacts]│
│             │  ━  │                     ┌───────────────┐  │ Workspace Datasets    │
│             │  ━  │                     │ User message  │  │ Chat Datasets         │
│             │  ━  │                     └───────────────┘  │                       │
│             │  ━  │  Assistant response                    │                       │
│             │     │  ▼ Execution trace                    │                       │
│             │     │  ✓ Inspect dataset                    │                       │
│             │     │  ✓ Execute Python                     │                       │
│             │     │  [Interactive Chart / File card]      ├───────────────────────┤
│             │     │                                        │ QUICK ASSISTANT       │
│             │     ├────────────────────────────────────────┤                       │
│             │     │ [Queue] [Steer] (only while running)   │ Ask about this...     │
│             │     │ [Attachments]                          │                       │
│             │     │ Ask anything...                        │                       │
│             │     │ + [Folder?] Model Effort  Mic  Send    │                       │
└─────────────┴─────┴────────────────────────────────────────┴───────────────────────┘
```

Header:
- Standalone = `Chat Name` (no folder icon or workspace name).
- Workspace chat = `Folder icon / Workspace Name > Chat Name`.
- Share and right sidebar toggle.

Narrow chat navigator: each bar = user question/AI answer pair, hover reveals question and response preview, click scrolls to section, active bar tracks scroll.

Messages: right-aligned user messages; AI markdown, code/SQL, data tables, inline charts using Recharts when structured data exists, static image fallback, file cards, expandable tool/execution trace; simulated streaming for frontend-only MVP. Don't invent private model reasoning.

Composer: attachment thumbnails and cards with remove; + connector menu; **folder selector only for standalone chats**; model selector; independent effort selector; mic and Send. Moving an existing standalone chat into workspace updates membership without replacing chat ID/messages. During active execution offer Queue and Steer once user types; simulate honestly until real backend exists.

Right sidebar **one mode at a time**:
- Closed
- Context (Datasets / Artifacts + independent mini Quick Assistant)
- File Preview (Back → Context; X → Closed; table/image/PDF preview + download)

Datasets separate into Workspace Datasets and Chat Datasets. CSV/Excel/Parquet structured data appear under Datasets, images/plots/PDFs/reports under Artifacts. Starred artifacts show saved state and appear in Library references; do not duplicate physical files. Clicking any file opens right preview, replacing context sidebar.

Mobile: collapse secondary navigator/right context, keep composer accessible; avoid overlapping fixed elements.

## Scope for current sprint
Implement **these four frontend pages only** using typed mock adapters/localStorage. Do NOT implement FastAPI, Gemini, E2B, real OAuth or a production database now. Preserve backend-ready API boundaries.
