import type { SqlResult, SqlTable } from "@/lib/api";
import type { CustomResult, CustomKind, DashboardWidget } from "../types";

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CHART_KINDS = ["bar", "hbar", "line", "area", "pie", "radar", "funnel", "treemap", "histogram"] as const;

/** The query a preset tile (type, x, y, aggregation) is equivalent to. A starting point the user can edit by hand. */
export function generatedSql(widget: DashboardWidget, table: string): string {
  const t = quote(table);
  const measure = widget.agg === "count" || !widget.y ? "COUNT(*)" : `${widget.agg === "avg" ? "AVG" : "SUM"}(${quote(widget.y)})`;
  switch (widget.type) {
    case "table": return `SELECT * FROM ${t} LIMIT 50`;
    case "kpi": return `SELECT ${measure} AS value FROM ${t}`;
    case "gauge": return `SELECT AVG(${quote(widget.y ?? "value")}) AS value, MAX(${quote(widget.y ?? "value")}) AS max FROM ${t}`;
    case "scatter": return `SELECT ${quote(widget.x ?? "x")} AS x, ${quote(widget.y ?? "y")} AS y FROM ${t} LIMIT 400`;
    case "histogram": return `SELECT ROUND(${quote(widget.x ?? "value")}, 0) AS bucket, COUNT(*) AS value FROM ${t} GROUP BY bucket ORDER BY bucket`;
    case "line":
    case "area": return `SELECT ${quote(widget.x ?? "name")} AS name, ${measure} AS value FROM ${t} GROUP BY ${quote(widget.x ?? "name")} ORDER BY ${quote(widget.x ?? "name")}`;
    default: return `SELECT ${quote(widget.x ?? "name")} AS name, ${measure} AS value FROM ${t} GROUP BY ${quote(widget.x ?? "name")} ORDER BY value DESC LIMIT 12`;
  }
}

const asNumber = (cell: string | number | null | undefined): number => {
  const value = typeof cell === "number" ? cell : Number(String(cell ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
};

/** Turns what a query returned into the same shape the script-built tiles draw, using the tile's chart type. */
export function resultFromSql(widget: Pick<DashboardWidget, "type">, result: SqlResult): CustomResult {
  const type = widget.type === "custom" ? "table" : widget.type;
  const first = result.rows[0];
  if (type === "kpi") {
    if (!first) throw new Error("The query returned no rows. A number tile needs one value.");
    return { kind: "kpi", value: asNumber(first[0]), label: result.columns[0] };
  }
  if (type === "gauge") {
    if (!first) throw new Error("The query returned no rows. A gauge needs a value (and optionally a max).");
    const value = asNumber(first[0]);
    return { kind: "gauge", value, max: first.length > 1 && asNumber(first[1]) > 0 ? asNumber(first[1]) : Math.max(value, 1) };
  }
  if (type === "table") return { kind: "table", columns: result.columns.slice(0, 8), rows: result.rows.slice(0, 50).map((row) => row.slice(0, 8).map((cell) => String(cell ?? ""))) };
  if (type === "scatter") {
    if (result.columns.length < 2) throw new Error("A scatter needs two number columns: x, then y.");
    return { kind: "scatter", points: result.rows.map((row): [number, number] => [asNumber(row[0]), asNumber(row[1])]).slice(0, 400) };
  }
  if (result.columns.length < 2) throw new Error("A chart needs two columns: a label, then a number.");
  const kind: CustomKind = (CHART_KINDS as readonly string[]).includes(type) ? (type as CustomKind) : "bar";
  return { kind, labels: result.rows.map((row) => String(row[0] ?? "")), series: result.rows.map((row) => asNumber(row[1])) };
}

/** The table a widget reads: the one for its dataset (or its first dataset) among the tables the API reported. */
export function tableFor(widget: Pick<DashboardWidget, "dataset_id" | "datasets">, tables: SqlTable[]): SqlTable | undefined {
  return tables.find((table) => table.dataset_id === widget.dataset_id) ?? tables.find((table) => widget.datasets?.includes(table.dataset_id));
}
