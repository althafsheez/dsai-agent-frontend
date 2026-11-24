import { NUMERIC_X_TYPES, SINGLE_VALUE_TYPES } from "../types";
import type { DashboardWidget, DatasetLite, Filters, WidgetType } from "../types";

export interface Point { name: string; value: number }

const NUMERIC_TYPE = /int|float|double|decimal|number|numeric/i;
const ID_NAME = /(^|[_\s])id$/i;

/** The API types every CSV column as a string, so kinds are inferred from the preview rows. */
export function columnKind(dataset: DatasetLite, index: number): "number" | "category" | "id" {
  const name = dataset.columns[index]?.name ?? "";
  const values = dataset.rows.map((row) => row[index]).filter((value) => value !== null && value !== "" && value !== "N/A");
  const numeric = values.length > 0 && (NUMERIC_TYPE.test(dataset.columns[index]?.data_type ?? "") || values.every((value) => Number.isFinite(Number(value))));
  const distinct = new Set(values.map(String)).size;
  if (ID_NAME.test(name) || (values.length > 20 && distinct > values.length * 0.9 && !numeric)) return "id";
  if (numeric && (distinct > 12 || NUMERIC_TYPE.test(dataset.columns[index]?.data_type ?? ""))) return "number";
  return "category";
}

const namesOf = (dataset: DatasetLite, kind: ReturnType<typeof columnKind>) => dataset.columns.filter((_, index) => columnKind(dataset, index) === kind).map((column) => column.name);
export const numericColumns = (dataset: DatasetLite) => namesOf(dataset, "number");
/** Columns whose values are all numbers, including low-variety ones (years, ratings) that columnKind treats as categories. Ids are left out. */
export function numberLikeColumns(dataset: DatasetLite): string[] {
  return dataset.columns.filter((column, index) => {
    if (columnKind(dataset, index) === "id") return false;
    const values = dataset.rows.map((row) => row[index]).filter((value) => value !== null && value !== "" && value !== "N/A");
    return values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
  }).map((column) => column.name);
}
export const categoryColumns = (dataset: DatasetLite) => namesOf(dataset, "category");

function columnIndex(dataset: DatasetLite, name?: string): number {
  return name ? dataset.columns.findIndex((column) => column.name === name) : -1;
}

function reduce(values: number[], agg: DashboardWidget["agg"]): number {
  if (agg === "count") return values.length;
  const sum = values.reduce((total, value) => total + value, 0);
  return agg === "avg" ? (values.length ? sum / values.length : 0) : sum;
}

export function kpiValue(widget: DashboardWidget, dataset: DatasetLite): number {
  const y = columnIndex(dataset, widget.y);
  if ((widget.agg === "count" || y < 0) && dataset.row_count) return dataset.row_count;
  const values = widget.agg === "count" || y < 0 ? dataset.rows.map(() => 1) : dataset.rows.map((row) => Number(row[y])).filter(Number.isFinite);
  return reduce(values, widget.agg);
}

/** Groups rows by the category column and aggregates the numeric column. Line/area: in x order; others: top 12 groups, largest first. */
export function groupedPoints(widget: DashboardWidget, dataset: DatasetLite): Point[] {
  const x = columnIndex(dataset, widget.x);
  const y = columnIndex(dataset, widget.y);
  if (x < 0) return [];
  const groups = new Map<string, number[]>();
  for (const row of dataset.rows) {
    const key = String(row[x] ?? "—");
    const list = groups.get(key) ?? [];
    list.push(widget.agg === "count" || y < 0 ? 1 : Number(row[y]));
    groups.set(key, list);
  }
  const points = [...groups].map(([name, values]) => ({ name, value: Math.round(reduce(values.filter(Number.isFinite), widget.agg) * 100) / 100 }));
  // Trends read left to right in x order (numbers as numbers), like the tile's SQL: ORDER BY x.
  if (widget.type === "line" || widget.type === "area") {
    const numeric = points.every((point) => point.name.trim() !== "" && Number.isFinite(Number(point.name)));
    return points.sort((left, right) => numeric ? Number(left.name) - Number(right.name) : left.name.localeCompare(right.name)).slice(0, 60);
  }
  return points.sort((left, right) => right.value - left.value).slice(0, widget.type === "radar" ? 8 : 12);
}

const BINS = 10;
/** Histogram: rows counted in ten equal-width ranges of a numeric column. */
export function histogramBins(widget: DashboardWidget, dataset: DatasetLite): Point[] {
  const x = columnIndex(dataset, widget.x);
  const values = dataset.rows.map((row) => Number(row[x])).filter(Number.isFinite);
  if (x < 0 || values.length < 2) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) return [];
  const width = (high - low) / BINS;
  const counts = Array.from({ length: BINS }, () => 0);
  for (const value of values) counts[Math.min(Math.floor((value - low) / width), BINS - 1)] += 1;
  return counts.map((count, index) => ({ name: `${formatNumber(low + index * width)}–${formatNumber(low + (index + 1) * width)}`, value: count }));
}

/** Scatter: one dot per row for two numeric columns (every nth row when there are many). */
export function scatterPoints(widget: DashboardWidget, dataset: DatasetLite): Array<{ x: number; y: number }> {
  const x = columnIndex(dataset, widget.x);
  const y = columnIndex(dataset, widget.y);
  if (x < 0 || y < 0) return [];
  const pairs = dataset.rows.map((row) => ({ x: Number(row[x]), y: Number(row[y]) })).filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.y));
  const step = Math.max(Math.ceil(pairs.length / 400), 1);
  return pairs.filter((_, index) => index % step === 0);
}

/** Gauge: the average of a numeric column against that column's maximum. */
export function gaugeValue(widget: DashboardWidget, dataset: DatasetLite): { value: number; max: number } | null {
  const y = columnIndex(dataset, widget.y);
  const values = dataset.rows.map((row) => Number(row[y])).filter(Number.isFinite);
  if (y < 0 || !values.length) return null;
  return { value: reduce(values, "avg"), max: Math.max(...values) };
}

export const CHART_LABEL: Record<WidgetType, string> = {
  kpi: "KPI", gauge: "Gauge", bar: "Bar", hbar: "Horizontal bar", line: "Line", area: "Area", pie: "Pie", radar: "Radar", funnel: "Funnel", treemap: "Treemap", histogram: "Histogram", scatter: "Scatter", table: "Table", custom: "Python script",
};

let counter = 0;
const widgetId = () => `w-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newWidget(type: WidgetType, dataset: DatasetLite): DashboardWidget {
  const numbers = [...new Set([...numericColumns(dataset), ...numberLikeColumns(dataset)])];
  const y = numbers[0];
  const x = categoryColumns(dataset)[0] ?? dataset.columns[0]?.name;
  const numericX = NUMERIC_X_TYPES.includes(type);
  const single = SINGLE_VALUE_TYPES.includes(type);
  const column = numericX ? y : x;
  const subject = single || !column ? (y ?? dataset.name) : column;
  const prefix = { kpi: "Total", gauge: "Average", bar: "By", hbar: "Ranking of", line: "Trend of", area: "Area of", pie: "Share of", radar: "Profile of", funnel: "Funnel of", treemap: "Breakdown of", histogram: "Distribution of", scatter: "Relationship of", table: "Rows from", custom: "Custom view of" }[type];
  const base = { id: widgetId(), type, title: `${prefix} ${subject}`, dataset_id: dataset.id, span: (single ? (type === "table" ? 3 : 1) : 2) as DashboardWidget["span"] };
  if (single) return { ...base, y, agg: type === "gauge" ? "avg" : y ? "sum" : "count" };
  if (type === "histogram") return { ...base, x: y, agg: "count" };
  if (type === "scatter") return { ...base, x: y, y: numbers[1] ?? y, agg: "sum" };
  return { ...base, x, y, agg: y ? "sum" : "count" };
}

/** Starter layout: row count + KPIs, then a varied set of charts that fit the data's shape. */
export function suggestWidgets(datasets: DatasetLite[]): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  for (const dataset of datasets) {
    const numbers = numericColumns(dataset);
    const categories = categoryColumns(dataset);
    widgets.push({ ...newWidget("kpi", dataset), title: `Rows in ${dataset.name}`, y: undefined, agg: "count" });
    if (numbers[0]) widgets.push(newWidget("kpi", dataset), newWidget("gauge", dataset));
    if (categories[0] && numbers[0]) widgets.push(newWidget("hbar", dataset));
    if (categories[0]) widgets.push({ ...newWidget("pie", dataset), y: undefined, agg: "count", title: `Share of ${categories[0]}` });
    if (numbers[0]) widgets.push(newWidget("histogram", dataset));
    if (numbers[1]) widgets.push(newWidget("scatter", dataset));
    if (categories[0] && numbers[0]) widgets.push(newWidget("bar", dataset));
    widgets.push(newWidget("table", dataset));
  }
  return widgets;
}

/** Rows that match every active filter. Filters on columns the dataset lacks are ignored. */
export function applyFilters(dataset: DatasetLite, filters: Filters): DatasetLite {
  const active = Object.entries(filters)
    .map(([column, values]) => ({ index: columnIndex(dataset, column), values: new Set(values) }))
    .filter((item) => item.index >= 0 && item.values.size > 0);
  if (!active.length) return dataset;
  const rows = dataset.rows.filter((row) => active.every((item) => item.values.has(String(row[item.index] ?? "—"))));
  return { ...dataset, rows, row_count: rows.length };
}

/** Distinct values of a column across datasets, most frequent first. Null when there are too many to slice on. */
export function sliceValues(datasets: DatasetLite[], column: string, max = 40): string[] | null {
  const counts = new Map<string, number>();
  for (const dataset of datasets) {
    const index = columnIndex(dataset, column);
    if (index < 0) continue;
    for (const row of dataset.rows) {
      const key = String(row[index] ?? "—");
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (counts.size > max * 4) return null;
    }
  }
  if (counts.size > max) return null;
  return [...counts].sort((left, right) => right[1] - left[1]).map(([value]) => value);
}

/** Columns that make sensible slicers: low-cardinality categories present in any dataset. */
export function slicerCandidates(datasets: DatasetLite[]): string[] {
  const names = new Set<string>();
  for (const dataset of datasets) {
    dataset.columns.forEach((column, index) => {
      if (columnKind(dataset, index) !== "category") return;
      const cells = dataset.rows.map((row) => row[index]).filter((cell) => cell !== null && cell !== "");
      if (cells.length && cells.every((cell) => Number.isFinite(Number(cell)))) return;
      const values = sliceValues([dataset], column.name);
      if (values && values.length > 1) names.add(column.name);
    });
  }
  return [...names];
}

export function formatNumber(value: number): string {
  return Math.abs(value) >= 1000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value) : String(Math.round(value * 100) / 100);
}
