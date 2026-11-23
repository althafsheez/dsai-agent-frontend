import type { DashboardWidget } from "../types";

/**
 * Packs widgets into rows of 3 columns in their given order. When the next widget does not fit, the
 * row is closed and its last widget is stretched to fill the leftover columns, so there are no gaps.
 */
export function packedSpans(widgets: Array<Pick<DashboardWidget, "id" | "span">>): Record<string, 1 | 2 | 3> {
  const spans: Record<string, 1 | 2 | 3> = {};
  let row: Array<{ id: string; span: number }> = [];
  let used = 0;
  const close = () => {
    if (row.length && used < 3) row[row.length - 1].span += 3 - used;
    for (const item of row) spans[item.id] = item.span as 1 | 2 | 3;
    row = [];
    used = 0;
  };
  for (const widget of widgets) {
    const span = Math.min(3, Math.max(1, widget.span));
    if (used + span > 3) close();
    row.push({ id: widget.id, span });
    used += span;
    if (used === 3) close();
  }
  close();
  return spans;
}

/** The list with the item at `from` moved to `to` (clamped). Returns the same list when nothing moves. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const target = Math.min(Math.max(to, 0), items.length - 1);
  if (from < 0 || from >= items.length || from === target) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
