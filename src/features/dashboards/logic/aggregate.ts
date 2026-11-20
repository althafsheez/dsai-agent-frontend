import type { DashboardWidget, DatasetLite, WidgetType } from "../types";

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

/** Groups rows by the category column and aggregates the numeric column. Top 12 groups, largest first for bar/pie. */
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
  return widget.type === "line" ? points.slice(0, 12) : points.sort((left, right) => right.value - left.value).slice(0, 12);
}

let counter = 0;
const widgetId = () => `w-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newWidget(type: WidgetType, dataset: DatasetLite): DashboardWidget {
  const y = numericColumns(dataset)[0];
  const x = categoryColumns(dataset)[0] ?? dataset.columns[0]?.name;
  const label = { kpi: "Total", bar: "By", line: "Trend of", pie: "Share of", table: "Rows from" }[type];
  const subject = type === "kpi" || !x ? (y ?? dataset.name) : x;
  return { id: widgetId(), type, title: `${label} ${subject}`, dataset_id: dataset.id, x: type === "kpi" || type === "table" ? undefined : x, y, agg: y ? "sum" : "count", span: type === "kpi" ? 1 : type === "table" ? 3 : 2 };
}

/** Starter layout: row count + one KPI per numeric column, then charts that fit the data's shape. */
export function suggestWidgets(datasets: DatasetLite[]): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  for (const dataset of datasets) {
    const numbers = numericColumns(dataset);
    const categories = categoryColumns(dataset);
    widgets.push({ ...newWidget("kpi", dataset), title: `Rows in ${dataset.name}`, y: undefined, agg: "count" });
    if (numbers[0]) widgets.push(newWidget("kpi", dataset));
    if (categories[0] && numbers[0]) widgets.push(newWidget("bar", dataset));
    if (categories[0]) widgets.push({ ...newWidget("pie", dataset), y: undefined, agg: "count", title: `Share of ${categories[0]}` });
    if (numbers[0]) widgets.push(newWidget("line", dataset));
    widgets.push(newWidget("table", dataset));
  }
  return widgets;
}

export function formatNumber(value: number): string {
  return Math.abs(value) >= 1000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value) : String(Math.round(value * 100) / 100);
}
