import { describe, expect, it } from "vitest";
import { applyFilters, columnKind, groupedPoints, kpiValue, newWidget, slicerCandidates, sliceValues, suggestWidgets } from "./aggregate";
import type { DatasetLite } from "../types";

const dataset: DatasetLite = {
  id: "d1", name: "sales.csv", row_count: 4,
  columns: [{ name: "region", data_type: "string" }, { name: "revenue", data_type: "int64" }],
  rows: [["east", 10], ["west", 30], ["east", 20], ["north", 5]],
};

describe("dashboard aggregation", () => {
  it("sums a numeric column for a KPI", () => {
    expect(kpiValue({ ...newWidget("kpi", dataset) }, dataset)).toBe(65);
  });
  it("groups and sorts bar points", () => {
    expect(groupedPoints(newWidget("bar", dataset), dataset)).toEqual([{ name: "east", value: 30 }, { name: "west", value: 30 }, { name: "north", value: 5 }]);
  });
  it("suggests widgets that fit the data shape", () => {
    const types = suggestWidgets([dataset]).map((widget) => widget.type);
    expect(types).toEqual(["kpi", "kpi", "bar", "pie", "line", "table"]);
  });
});

describe("column kinds from string-typed CSV data", () => {
  const rows = Array.from({ length: 30 }, (_, index) => [String(1000 + index), index % 2 ? "Male" : "Female", String(20 + index), String(index % 2)]);
  const csv: DatasetLite = { id: "d2", name: "people.csv", row_count: 30, rows, columns: ["id", "gender", "age", "flag"].map((name) => ({ name, data_type: "string" })) };
  it("treats ids as ids, wide numerics as numbers and low-cardinality values as categories", () => {
    expect(columnKind(csv, 0)).toBe("id");
    expect(columnKind(csv, 1)).toBe("category");
    expect(columnKind(csv, 2)).toBe("number");
    expect(columnKind(csv, 3)).toBe("category");
  });
});

const filterData: DatasetLite = {
  id: "d", name: "d.csv", row_count: 4,
  columns: [{ name: "segment", data_type: "string" }, { name: "spend", data_type: "string" }],
  rows: [["SMB", "10"], ["SMB", "20"], ["Ent", "300"], ["Startup", "5"]],
};

describe("filters and slicers", () => {
  it("keeps rows matching all filters and updates the row count", () => {
    const filtered = applyFilters(filterData, { segment: ["SMB", "Startup"] });
    expect(filtered.rows).toHaveLength(3);
    expect(filtered.row_count).toBe(3);
  });
  it("ignores filters on missing columns and empty selections", () => {
    expect(applyFilters(filterData, { nope: ["x"], segment: [] })).toBe(filterData);
  });
  it("lists slice values by frequency and offers low-cardinality category columns", () => {
    expect(sliceValues([filterData], "segment")).toEqual(["SMB", "Ent", "Startup"]);
    expect(slicerCandidates([filterData])).toEqual(["segment"]);
  });
});
