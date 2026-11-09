# Global design system — sourced from Anita's stylesheet

Source: [Dsai-light-version/src/styles.css](https://github.com/AnitaGeorge404/Dsai-light-version/blob/main/src/styles.css). These values were verified against the source. Preserve their meaning across all pages.

## Colors (OKLCH, exact source values)

```css
:root {
  --background: oklch(0.165 0.004 260);
  --foreground: oklch(0.94 0.004 85);
  --surface: oklch(0.205 0.005 260);
  --surface-2: oklch(0.235 0.005 260);
  --surface-3: oklch(0.275 0.006 260);
  --popover: oklch(0.225 0.005 260);
  --muted: oklch(0.235 0.005 260);
  --muted-foreground: oklch(0.66 0.008 260);
  --border: oklch(0.28 0.005 260);
  --border-strong: oklch(0.36 0.006 260);
  --input: oklch(0.30 0.005 260);
  --primary: oklch(0.92 0.008 85);
  --primary-foreground: oklch(0.18 0.005 260);
  --sidebar: oklch(0.18 0.005 260);
  --sidebar-foreground: oklch(0.78 0.006 260);
  --sidebar-accent: oklch(0.245 0.005 260);
  --sidebar-accent-foreground: oklch(0.95 0.005 85);
  --sidebar-border: oklch(0.255 0.005 260);
  --navy: oklch(0.78 0.07 258);
  --sage: oklch(0.74 0.07 152);
  --destructive: oklch(0.65 0.17 25);
  --success: oklch(0.74 0.085 152);
}
```

## Typography
- Interface: **Inter**, explicitly loaded (e.g. via `next/font/google`), with system sans fallback.
- Optional display accents: **Fraunces** or **Instrument Serif**, but keep primary app UI in Inter.
- Code/SQL: **JetBrains Mono** or a suitable monospace fallback.
- Main body comfortable around 14px; secondary labels around 12–13px; restrained weight differences.
- Warm white text; muted labels; no giant gradients or glowing headlines.

## Shape and spacing
- Source radii: 4px small, 6px medium, 10px large, 14px extra-large; avoid oversized pill shapes except where useful.
- Compact navigation rows and toolbars, generous blank space in content panels.
- Hairline neutral borders, subtle surfaces instead of prominent card shadows.
- Sidebar width roughly 240px expanded; around 56px collapsed. Use one shared sidebar implementation.
- Active sidebar row uses `--sidebar-accent`; icons remain muted until hover/selection.
- Buttons: warm off-white primary with dark text; secondary buttons in muted charcoal.
- Use Lucide icons at consistent sizing; avoid emoji as production UI icons.
- Minimal, Linear-inspired visual hierarchy; NO purple/neon, heavy glass, decorative gradients or mismatched palettes.

## Shared UI contracts
- Global left sidebar on Landing, History and Chat; **no** global sidebar on Auth.
- Main app shell remains stable across routes.
- Floating menus/popovers share tokens, focus handling, shadow, z-index, click-outside behavior.
- Right sidebar exists on Chat only; Context and File Preview are mutually exclusive.
- Respect reduced motion, keyboard focus, accessible contrast and responsive widths.

## Tailwind compatibility
The source repo uses Tailwind CSS 4 and `@theme` utilities. Our app uses the established Next.js 15 + Tailwind CSS 3 stack. Implement the exact palette through standard CSS custom properties and Tailwind 3-compatible mapping; **do not migrate to Tailwind 4 without approval**.
