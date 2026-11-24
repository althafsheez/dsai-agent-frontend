import { describe, expect, it } from "vitest";
import { resolveLayouts, settle } from "./grid";

const w = (id: string, span: 1 | 2 | 3, type: "bar" | "kpi" = "bar") => ({ id, type, span });

describe("free grid", () => {
  it("places tiles without a saved cell in the first free spot", () => {
    const layouts = resolveLayouts([w("a", 2), w("b", 1), w("c", 3)]);
    expect(layouts.a).toMatchObject({ c: 0, r: 0, w: 8 });
    expect(layouts.b).toMatchObject({ c: 8, r: 0, w: 4 });
    expect(layouts.c.r).toBeGreaterThan(0);
  });

  it("keeps saved cells and lets any size through", () => {
    const layouts = resolveLayouts([{ ...w("a", 1), layout: { c: 2, r: 1, w: 5, h: 3 } }]);
    expect(layouts.a).toEqual({ c: 2, r: 1, w: 5, h: 3 });
  });

  it("moves other tiles out of the way of the dropped one", () => {
    const out = settle({ a: { c: 0, r: 0, w: 6, h: 4 }, b: { c: 6, r: 0, w: 6, h: 4 } }, "b");
    const moved = settle({ ...out, b: { c: 0, r: 0, w: 6, h: 4 } }, "b");
    expect(moved.b).toMatchObject({ c: 0, r: 0 });
    expect(moved.a.r).toBeGreaterThanOrEqual(4);
  });
});
