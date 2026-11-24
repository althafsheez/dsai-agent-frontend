import { describe, expect, it } from "vitest";
import { packedSpans } from "./layout";

const w = (id: string, span: 1 | 2 | 3) => ({ id, span });

describe("packedSpans", () => {
  it("leaves full rows alone", () => {
    expect(packedSpans([w("a", 1), w("b", 1), w("c", 1), w("d", 3)])).toEqual({ a: 1, b: 1, c: 1, d: 3 });
  });
  it("stretches the last widget of a short row", () => {
    expect(packedSpans([w("a", 1), w("b", 1), w("c", 2), w("d", 2)])).toEqual({ a: 1, b: 2, c: 3, d: 3 });
  });
  it("fills a single widget row and a trailing short row", () => {
    expect(packedSpans([w("a", 2), w("b", 2), w("c", 1)])).toEqual({ a: 3, b: 2, c: 1 });
  });
  it("returns nothing for no widgets", () => {
    expect(packedSpans([])).toEqual({});
  });
});

describe("moveItem", () => {
  it("moves an item and clamps at the ends", async () => {
    const { moveItem } = await import("./layout");
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 5)).toEqual(["a", "b", "c"]);
  });
});
