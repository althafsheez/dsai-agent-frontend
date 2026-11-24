import type { DashboardWidget, WidgetLayout } from "../types";

/** The canvas is a free 12-column grid: any width 1-12, any height, any position. */
export const COLS = 12;
export const MIN_W = 1;
export const MIN_H = 2;

export type Layouts = Record<string, WidgetLayout>;

const HEIGHT: Partial<Record<DashboardWidget["type"], number>> = { kpi: 2, gauge: 4, table: 6, custom: 5 };

const hit = (a: WidgetLayout, b: WidgetLayout) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;

/** Clamps a layout into the grid. */
export function clampLayout(layout: WidgetLayout): WidgetLayout {
  const w = Math.min(COLS, Math.max(MIN_W, Math.round(layout.w)));
  const h = Math.max(MIN_H, Math.round(layout.h));
  return { w, h, c: Math.min(COLS - w, Math.max(0, Math.round(layout.c))), r: Math.max(0, Math.round(layout.r)) };
}

/** Every widget's cell: the saved one, or the first free spot (the old 1/3-2/3-3/3 span sets the starting width). */
export function resolveLayouts(widgets: Array<Pick<DashboardWidget, "id" | "type" | "span" | "layout">>): Layouts {
  const result: Layouts = {};
  const placed: WidgetLayout[] = [];
  for (const widget of widgets) if (widget.layout) { result[widget.id] = clampLayout(widget.layout); placed.push(result[widget.id]); }
  for (const widget of widgets) {
    if (widget.layout) continue;
    const w = Math.min(COLS, Math.max(1, (widget.span ?? 1) * 4));
    const h = HEIGHT[widget.type] ?? 5;
    let spot: WidgetLayout | undefined;
    for (let r = 0; !spot; r += 1) {
      for (let c = 0; c + w <= COLS && !spot; c += 1) {
        const candidate = { c, r, w, h };
        if (!placed.some((other) => hit(candidate, other))) spot = candidate;
      }
    }
    result[widget.id] = spot;
    placed.push(spot);
  }
  return result;
}

/** Puts `movedId` where it was dropped and moves everything else out of its way, packing the rest upward. */
export function settle(layouts: Layouts, movedId: string): Layouts {
  const moved = clampLayout(layouts[movedId]);
  const placed: WidgetLayout[] = [moved];
  const result: Layouts = { [movedId]: moved };
  const others = Object.entries(layouts).filter(([id]) => id !== movedId).sort(([, a], [, b]) => a.r - b.r || a.c - b.c);
  for (const [id, layout] of others) {
    const next = clampLayout(layout);
    next.r = 0;
    while (placed.some((other) => hit(next, other))) next.r += 1;
    result[id] = next;
    placed.push(next);
  }
  return result;
}

/** Number of grid rows the layouts reach. */
export const rowsOf = (layouts: Layouts) => Object.values(layouts).reduce((max, item) => Math.max(max, item.r + item.h), 0);
