import { CHART_LABEL } from "./aggregate";
import type { Aggregate, DashboardWidget, DatasetLite, WidgetType } from "../types";
import type { DatasetRelations } from "@/lib/api";

/** What a person fills in for one kind of tile. */
export type TileField = "category" | "value" | "aggregate" | "number-x" | "number-y" | "describe";

export interface TileInfo { label: string; hint: string; needs: string[]; fields: TileField[] }

const GROUPED: TileInfo["fields"] = ["category", "aggregate", "value"];
const group = (label: string, hint: string): TileInfo => ({ label, hint, needs: ["A category column to group by", "A number column to add up or average, or just count rows"], fields: GROUPED });

/** The tile menu of the manual composer, and what each tile needs, so nobody has to guess. */
export const TILE_INFO: Record<WidgetType, TileInfo> = {
  kpi: { label: CHART_LABEL.kpi, hint: "One big number", needs: ["A number column to total or average, or just count rows"], fields: ["aggregate", "value"] },
  gauge: { label: CHART_LABEL.gauge, hint: "Average against the highest value", needs: ["A number column"], fields: ["value"] },
  bar: group(CHART_LABEL.bar, "Values by category"),
  hbar: group(CHART_LABEL.hbar, "Ranking, long labels"),
  line: group(CHART_LABEL.line, "Change over a sequence"),
  area: group(CHART_LABEL.area, "Trend with volume"),
  pie: group(CHART_LABEL.pie, "Share of the total"),
  radar: group(CHART_LABEL.radar, "Profile across categories"),
  funnel: group(CHART_LABEL.funnel, "Largest to smallest"),
  treemap: group(CHART_LABEL.treemap, "Many parts at once"),
  histogram: { label: CHART_LABEL.histogram, hint: "How values are spread", needs: ["A number column"], fields: ["number-x"] },
  scatter: { label: CHART_LABEL.scatter, hint: "Two numbers, one dot per row", needs: ["Two number columns"], fields: ["number-x", "number-y"] },
  table: { label: CHART_LABEL.table, hint: "The raw rows", needs: ["Nothing: it shows the rows"], fields: [] },
  custom: { label: "Anything else (Python)", hint: "Not in the list? The AI writes a script", needs: ["Say in plain words what to calculate or show", "One or more datasets to read"], fields: ["describe"] },
};

export interface TileSpec { type: WidgetType; title: string; datasetIds: string[]; x: string; y: string; agg: Aggregate; notes: string }

export const emptySpec = (type: WidgetType, datasetIds: string[]): TileSpec => ({ type, title: "", datasetIds, x: "", y: "", agg: "sum", notes: "" });

/** What is still missing before the AI can be asked to build this tile. */
export function missingFor(spec: TileSpec): string[] {
  const fields = TILE_INFO[spec.type].fields;
  const missing: string[] = [];
  if (!spec.datasetIds.length) missing.push("a dataset");
  if (fields.includes("category") && !spec.x) missing.push("a category column");
  if (fields.includes("value") && spec.agg !== "count" && !spec.y) missing.push("a number column");
  if (fields.includes("number-x") && !spec.x) missing.push(spec.type === "scatter" ? "the X column" : "a number column");
  if (fields.includes("number-y") && !spec.y) missing.push("the Y column");
  if (fields.includes("describe") && spec.notes.trim().length < 5) missing.push("a description");
  return missing;
}

const AGG_WORDS: Record<Aggregate, string> = { sum: "the sum of", avg: "the average of", count: "a count of rows" };

/** The manual form, written out as the request the AI will build from. */
export function specInstruction(spec: TileSpec, datasets: DatasetLite[]): string {
  const names = spec.datasetIds.map((id) => datasets.find((dataset) => dataset.id === id)?.name ?? id);
  const info = TILE_INFO[spec.type];
  const title = spec.title.trim() ? ` titled "${spec.title.trim()}"` : "";
  const note = spec.notes.trim() && spec.type !== "custom" ? ` Extra detail: ${spec.notes.trim()}` : "";
  if (spec.type === "custom") return `Add a custom tile${title} built with a Python script on ${names.join(" and ")}: ${spec.notes.trim()}`;
  const measure = TILE_INFO[spec.type].fields.includes("aggregate") ? `${AGG_WORDS[spec.agg]}${spec.agg === "count" ? "" : ` "${spec.y}"`}` : spec.y && info.fields.includes("value") ? `"${spec.y}"` : "";
  const parts: string[] = [];
  if (measure) parts.push(measure);
  if (info.fields.includes("category") && spec.x) parts.push(`grouped by "${spec.x}"`);
  if (info.fields.includes("number-x") && spec.x) parts.push(spec.type === "scatter" ? `with "${spec.x}" on the X axis` : `of "${spec.x}"`);
  if (info.fields.includes("number-y") && spec.y) parts.push(`and "${spec.y}" on the Y axis`);
  return `Add a ${info.label} tile${title} from the dataset "${names[0]}"${parts.length ? `: ${parts.join(" ")}` : ""}.${note}`.replace(" .", ".");
}

const label = (widget: DashboardWidget) => `“${widget.title}”`;

/** Plain-words list of what a person changed by hand between two versions of the tiles. */
export function describeChanges(before: DashboardWidget[], after: DashboardWidget[]): string[] {
  const changes: string[] = [];
  const old = new Map(before.map((widget) => [widget.id, widget]));
  const now = new Set(after.map((widget) => widget.id));
  for (const widget of before) if (!now.has(widget.id)) changes.push(`Removed ${label(widget)}`);
  for (const widget of after) {
    const prior = old.get(widget.id);
    if (!prior) { changes.push(`Added ${label(widget)}`); continue; }
    if (prior.type !== widget.type) changes.push(`Changed ${label(prior)} from ${CHART_LABEL[prior.type]} to ${CHART_LABEL[widget.type]}`);
    if (prior.title !== widget.title) changes.push(`Renamed ${label(prior)} to ${label(widget)}`);
    const columns = (["x", "y", "agg"] as const).filter((key) => prior[key] !== widget[key]);
    if (columns.length) changes.push(`Changed the data of ${label(widget)} (${columns.map((key) => ({ x: "category column", y: "value column", agg: "aggregate" })[key]).join(", ")})`);
  }
  const kept = after.filter((widget) => old.has(widget.id)).map((widget) => widget.id);
  const was = before.filter((widget) => now.has(widget.id)).map((widget) => widget.id);
  if (kept.join() !== was.join()) changes.push("Rearranged the tiles");
  return changes;
}

/** The instruction that hands a person's hand edits to the AI. */
export function editsInstruction(changes: string[]): string {
  return `The user edited this dashboard by hand: ${changes.join("; ")}. Keep every one of those edits. Check that each edited tile still fits the data (right columns, a sensible chart type, a clear title) and repair only what does not.`;
}

/** What to do when two datasets disagree about the same quantity. */
export type ConflictPolicy = { kind: "separate" } | { kind: "compare" } | { kind: "prefer"; datasetId: string };

export const defaultPolicy: ConflictPolicy = { kind: "separate" };

/** The part of the AI prompt that records the datasets' overlap and the person's decision about conflicts. */
export function policyContext(policy: ConflictPolicy, datasets: DatasetLite[], relations: DatasetRelations | undefined): string {
  if (!relations || datasets.length < 2) return "";
  const lines = [`This dashboard reads ${datasets.length} datasets: ${datasets.map((dataset) => dataset.name).join(", ")}.`, ...relations.pairs.map((pair) => pair.summary)];
  if (!relations.conflict) return lines.join(" ");
  if (policy.kind === "prefer") {
    const chosen = datasets.find((dataset) => dataset.id === policy.datasetId);
    lines.push(`When the files disagree, the user chose ${chosen?.name ?? "one file"} as the source of truth: use it for the disputed numbers and never add the files together. Say so in a tile title or note.`);
  } else if (policy.kind === "compare") {
    lines.push("When the files disagree, the user wants both shown side by side, one tile per file, never merged or added together, each titled with its file name.");
  } else {
    lines.push("When the files disagree, the user wants them kept separate: every tile reads exactly one file, never adds numbers from two files together, and its title names the file.");
  }
  return lines.join(" ");
}
