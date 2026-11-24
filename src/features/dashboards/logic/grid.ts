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

/** Every widget's cell: the saved one, or the first free spot (the old 1/3-2/3-3/3 span sets the starting width). Never overlapping. */
export function resolveLayouts(widgets: Array<Pick<DashboardWidget, "id" | "type" | "span" | "layout">>): Layouts {
  const saved: Layouts = {};
  for (const widget of widgets) if (widget.layout) saved[widget.id] = clampLayout(widget.layout);
  const result = Object.keys(saved).length ? compact(pushDown(saved)) : {};
  const placed = Object.values(result);
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

const byPosition = (first?: string) => ([idA, a]: [string, WidgetLayout], [idB, b]: [string, WidgetLayout]) =>
  a.r - b.r || (idA === first ? -1 : idB === first ? 1 : a.c - b.c);

/** Places `first` exactly where it is, then walks the rest top to bottom, pushing each below anything placed before it that it overlaps. */
function pushDown(layouts: Layouts, first?: string): Layouts {
  const result: Layouts = {};
  const placed: WidgetLayout[] = [];
  const entries = Object.entries(layouts).sort(byPosition(first));
  const ordered = first ? [...entries.filter(([id]) => id === first), ...entries.filter(([id]) => id !== first)] : entries;
  for (const [id, layout] of ordered) {
    const next = { ...layout };
    for (let blocker = placed.find((other) => hit(next, other)); blocker; blocker = placed.find((other) => hit(next, other))) next.r = blocker.r + blocker.h;
    result[id] = next;
    placed.push(next);
  }
  return result;
}

/** Floats every tile up as far as it can go without overlapping one above it. Input must not overlap. */
function compact(layouts: Layouts, first?: string): Layouts {
  const result: Layouts = {};
  const placed: WidgetLayout[] = [];
  for (const [id, layout] of Object.entries(layouts).sort(byPosition(first))) {
    const next = { ...layout };
    while (next.r > 0 && !placed.some((other) => hit({ ...next, r: next.r - 1 }, other))) next.r -= 1;
    result[id] = next;
    placed.push(next);
  }
  return result;
}

/** Puts `movedId` where it was dropped, pushes whatever it covers down, then packs everything upward. Tiles never overlap. */
export function settle(layouts: Layouts, movedId: string): Layouts {
  const moved = clampLayout(layouts[movedId]);
  const others = Object.fromEntries(Object.entries(layouts).filter(([id]) => id !== movedId).map(([id, layout]) => [id, clampLayout(layout)]));
  return compact(pushDown({ ...others, [movedId]: moved }, movedId), movedId);
}

/** True when no two tiles share a cell. */
export const noOverlap = (layouts: Layouts) => {
  const items = Object.values(layouts);
  return items.every((a, i) => items.slice(i + 1).every((b) => !hit(a, b)));
};

/** Number of grid rows the layouts reach. */
export const rowsOf = (layouts: Layouts) => Object.values(layouts).reduce((max, item) => Math.max(max, item.r + item.h), 0);
