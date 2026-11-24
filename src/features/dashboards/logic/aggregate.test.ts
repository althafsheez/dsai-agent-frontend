import { describe, expect, it } from "vitest";
import { applyFilters, columnKind, gaugeValue, groupedPoints, histogramBins, scatterPoints, kpiValue, newWidget, slicerCandidates, sliceValues, suggestWidgets } from "./aggregate";
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
    expect(types).toEqual(["kpi", "kpi", "gauge", "hbar", "pie", "histogram", "bar", "table"]);
  });
});

describe("more chart types", () => {
  const numbers: DatasetLite = {
    id: "n", name: "n.csv", row_count: 6, columns: [{ name: "a", data_type: "int64" }, { name: "b", data_type: "int64" }],
    rows: [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50], [10, 60]],
  };
  it("bins a numeric column into ten ranges that hold every row", () => {
    const bins = histogramBins(newWidget("histogram", numbers), numbers);
    expect(bins).toHaveLength(10);
    expect(bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(6);
  });
  it("builds scatter points from two numeric columns", () => {
    const widget = newWidget("scatter", numbers);
    expect([widget.x, widget.y]).toEqual(["a", "b"]);
    expect(scatterPoints(widget, numbers)).toHaveLength(6);
  });
  it("compares a gauge's average with the column maximum", () => {
    expect(gaugeValue({ ...newWidget("gauge", numbers), y: "b" }, numbers)).toEqual({ value: 35, max: 60 });
  });
  it("keeps the radar to eight spokes, ranked", () => {
    const many: DatasetLite = { ...dataset, rows: Array.from({ length: 20 }, (_, index) => [`r${index}`, index]) };
    expect(groupedPoints({ ...newWidget("radar", many), x: "region", y: "revenue" }, many)).toHaveLength(8);
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
