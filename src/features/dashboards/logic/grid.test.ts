import { describe, expect, it } from "vitest";
import { noOverlap, resolveLayouts, settle } from "./grid";

const w = (id: string, span: 1 | 2 | 3, type: "bar" | "kpi" = "bar") => ({ id, type, span });

describe("free grid", () => {
  it("places tiles without a saved cell in the first free spot", () => {
    const layouts = resolveLayouts([w("a", 2), w("b", 1), w("c", 3)]);
    expect(layouts.a).toMatchObject({ c: 0, r: 0, w: 8 });
    expect(layouts.b).toMatchObject({ c: 8, r: 0, w: 4 });
    expect(layouts.c.r).toBeGreaterThan(0);
  });

  it("keeps saved sizes and columns, packed to the top", () => {
    const layouts = resolveLayouts([{ ...w("a", 1), layout: { c: 2, r: 1, w: 5, h: 3 } }]);
    expect(layouts.a).toEqual({ c: 2, r: 0, w: 5, h: 3 });
  });

  it("moves other tiles out of the way of the dropped one", () => {
    const out = settle({ a: { c: 0, r: 0, w: 6, h: 4 }, b: { c: 6, r: 0, w: 6, h: 4 } }, "b");
    const moved = settle({ ...out, b: { c: 0, r: 0, w: 6, h: 4 } }, "b");
    expect(moved.b).toMatchObject({ c: 0, r: 0 });
    expect(moved.a.r).toBeGreaterThanOrEqual(4);
  });
});

describe("free grid: no overlaps", () => {
  it("swaps with the tile above when dragged down over it", () => {
    const out = settle({ a: { c: 0, r: 0, w: 12, h: 4 }, b: { c: 0, r: 4, w: 12, h: 3 } }, "b");
    const dragged = settle({ ...out, b: { c: 0, r: 1, w: 12, h: 3 } }, "b");
    expect(dragged.b.r).toBe(0);
    expect(dragged.a.r).toBe(3);
  });

  it("repairs saved cells that overlap", () => {
    const layouts = resolveLayouts([
      { id: "a", type: "bar", span: 1, layout: { c: 0, r: 0, w: 6, h: 4 } },
      { id: "b", type: "bar", span: 1, layout: { c: 3, r: 1, w: 6, h: 4 } },
    ]);
    expect(noOverlap(layouts)).toBe(true);
  });

  it("never overlaps across many random drags and resizes", () => {
    let seed = 7;
    const rand = (n: number) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
    let layouts = resolveLayouts(Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, type: "bar" as const, span: ((i % 3) + 1) as 1 | 2 | 3 })));
    for (let step = 0; step < 300; step += 1) {
      const id = `t${rand(9)}`;
      const w = 1 + rand(12);
      layouts = settle({ ...layouts, [id]: { c: rand(12), r: rand(20), w, h: 2 + rand(6) } }, id);
      expect(noOverlap(layouts)).toBe(true);
      expect(layouts[id].w).toBe(w);
    }
  });
});
