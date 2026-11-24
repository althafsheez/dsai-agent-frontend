import { describe, expect, it } from "vitest";
import { defaultPolicy, describeChanges, editsInstruction, emptySpec, missingFor, policyContext, specInstruction } from "./manual";
import type { DashboardWidget, DatasetLite } from "../types";

const dataset = (id: string, name: string): DatasetLite => ({ id, name, columns: [{ name: "region", data_type: "string" }, { name: "revenue", data_type: "number" }], rows: [], row_count: 0 });
const widget = (id: string, extra: Partial<DashboardWidget> = {}): DashboardWidget => ({ id, type: "bar", title: id, dataset_id: "d1", x: "region", y: "revenue", agg: "sum", span: 2, ...extra });

describe("manual tiles", () => {
  it("lists what a tile still needs", () => {
    expect(missingFor(emptySpec("bar", []))).toEqual(["a dataset", "a category column", "a number column"]);
    expect(missingFor({ ...emptySpec("bar", ["d1"]), x: "region", agg: "count" })).toEqual([]);
    expect(missingFor(emptySpec("scatter", ["d1"]))).toEqual(["the X column", "the Y column"]);
    expect(missingFor(emptySpec("custom", ["d1"]))).toEqual(["a description"]);
    expect(missingFor(emptySpec("table", ["d1"]))).toEqual([]);
  });

  it("writes the form as a request for the AI", () => {
    const datasets = [dataset("d1", "sales.csv")];
    expect(specInstruction({ ...emptySpec("bar", ["d1"]), x: "region", y: "revenue", title: "Revenue by region" }, datasets)).toBe('Add a Bar tile titled "Revenue by region" from the dataset "sales.csv": the sum of "revenue" grouped by "region".');
    expect(specInstruction({ ...emptySpec("kpi", ["d1"]), agg: "count" }, datasets)).toBe('Add a KPI tile from the dataset "sales.csv": a count of rows.');
    expect(specInstruction({ ...emptySpec("custom", ["d1"]), notes: "share of revenue from the top 3 regions" }, datasets)).toContain("Python script on sales.csv: share of revenue");
  });
});

describe("hand edits", () => {
  it("describes what changed and hands it to the AI", () => {
    const before = [widget("a"), widget("b")];
    const after = [widget("b", { type: "pie", title: "Share" }), widget("a", { span: 3 }), widget("c")];
    const changes = describeChanges(before, after);
    expect(changes).toContain("Changed “b” from Bar to Pie");
    expect(changes).toContain("Renamed “b” to “Share”");
    expect(changes).toContain("Added “c”");
    expect(changes).toContain("Rearranged the tiles");
    expect(describeChanges(before, before)).toEqual([]);
    expect(editsInstruction(["Removed “a”"])).toContain("Keep every one of those edits");
  });
});

describe("conflict policy", () => {
  const sets = [dataset("d1", "a.csv"), dataset("d2", "b.csv")];
  const relations = { datasets: [], pairs: [{ a: "a.csv", b: "b.csv", shared_columns: ["id"], key: "id", matched_rows: 3, summary: "a.csv and b.csv give different values for revenue.", conflicts: [{ column: "revenue", by: "id", differing: 1, of: 3, examples: [] }] }], conflict: true };
  it("tells the AI what the person decided", () => {
    expect(policyContext(defaultPolicy, sets, relations)).toContain("kept separate");
    expect(policyContext({ kind: "prefer", datasetId: "d2" }, sets, relations)).toContain("b.csv as the source of truth");
    expect(policyContext({ kind: "compare" }, sets, relations)).toContain("side by side");
  });
  it("adds nothing for one dataset, or when nothing conflicts", () => {
    expect(policyContext(defaultPolicy, [sets[0]], relations)).toBe("");
    expect(policyContext(defaultPolicy, sets, { ...relations, conflict: false })).not.toContain("disagree");
  });
});
