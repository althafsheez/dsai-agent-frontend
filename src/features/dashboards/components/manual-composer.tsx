"use client";

import { useState } from "react";
import { AreaChart, BarChart3, BarChartHorizontal, ChartColumn, ChartScatter, Code2, Filter, Gauge, Hash, LayoutGrid, LineChart, LoaderCircle, PieChart, Radar, Table2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { categoryColumns, numberLikeColumns, numericColumns } from "../logic/aggregate";
import { TILE_INFO, emptySpec, missingFor, specInstruction } from "../logic/manual";
import type { TileSpec } from "../logic/manual";
import type { DatasetLite, WidgetType } from "../types";

const ICONS: Record<WidgetType, typeof Hash> = {
  kpi: Hash, gauge: Gauge, bar: BarChart3, hbar: BarChartHorizontal, line: LineChart, area: AreaChart, pie: PieChart, treemap: LayoutGrid, funnel: Filter,
  radar: Radar, histogram: ChartColumn, scatter: ChartScatter, table: Table2, custom: Code2,
};
const ORDER: WidgetType[] = ["kpi", "gauge", "bar", "hbar", "line", "area", "pie", "treemap", "funnel", "radar", "histogram", "scatter", "table", "custom"];
const field = "h-8 w-full rounded-md border bg-surface px-2 text-xs";

interface ManualComposerProps {
  datasets: DatasetLite[];
  busy: boolean;
  error?: string | null;
  /** Hands the tile to the AI. Resolves when the dashboard has been rebuilt with it. */
  onBuild: (spec: TileSpec, instruction: string) => Promise<void>;
}

/**
 * Pick a tile type, see what it needs, fill it in. Nothing is drawn from the form directly: it is written out as a
 * request and the AI analyses it against the real data and builds the tile (a Python script when no preset fits).
 */
export function ManualComposer({ datasets, busy, error, onBuild }: ManualComposerProps) {
  const [type, setType] = useState<WidgetType>("bar");
  const [picked, setPicked] = useState<string[]>([]);
  const [spec, setSpec] = useState<TileSpec>(emptySpec("bar", []));
  const chosen = picked.length ? picked.filter((id) => datasets.some((dataset) => dataset.id === id)) : datasets.slice(0, 1).map((dataset) => dataset.id);
  const current: TileSpec = { ...spec, type, datasetIds: chosen };
  const info = TILE_INFO[type];
  const first = datasets.find((dataset) => dataset.id === chosen[0]);
  const columns = first?.columns.map((column) => column.name) ?? [];
  const numbers = first ? [...new Set([...numericColumns(first), ...numberLikeColumns(first)])] : [];
  const categories = first ? categoryColumns(first) : [];
  const missing = missingFor(current);
  const update = (patch: Partial<TileSpec>) => setSpec({ ...current, ...patch });
  const select = (name: string, value: string, options: string[], key: "x" | "y", placeholder: string) => (
    <label className="block text-[11px] text-muted-foreground">{name}
      <select aria-label={name} value={value} onChange={(event) => update({ [key]: event.target.value })} className={cn(field, "mt-1 text-foreground")}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );

  async function build() {
    try { await onBuild(current, specInstruction(current, datasets)); setSpec(emptySpec(type, chosen)); } catch { /* the caller shows the error */ }
  }

  if (!datasets.length) return <p className="text-xs text-muted-foreground">Pick at least one dataset under Data, then choose the tile you want here.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">1. Choose a tile</p>
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-label="Tile types">
          {ORDER.map((value) => {
            const Icon = ICONS[value];
            return (
              <li key={value}>
                <button type="button" aria-pressed={type === value} title={TILE_INFO[value].hint} onClick={() => setType(value)}
                  className={cn("flex h-14 w-full flex-col items-center justify-center gap-1 rounded-lg border bg-surface px-1 text-center text-[10.5px] leading-tight text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground", type === value && "border-sky-400/70 bg-sky-400/10 text-foreground")}>
                  <Icon className="size-4" />{TILE_INFO[value].label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 rounded-lg border border-dashed p-2.5 text-[11px]" aria-label={`What a ${info.label} needs`}>
          <p className="font-medium text-foreground">{info.label} <span className="font-normal text-muted-foreground">· {info.hint}</span></p>
          <p className="mt-1.5 text-muted-foreground">It needs:</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">{info.needs.map((need) => <li key={need}>{need}</li>)}</ul>
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-medium text-muted-foreground">2. Tell the AI what it should show</p>
        {datasets.length > 1 ? (
          <fieldset className="rounded-md border p-2">
            <legend className="px-1 text-[11px] text-muted-foreground">{type === "custom" ? "Datasets the script may read" : "Dataset"}</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {datasets.map((dataset) => {
                const on = chosen.includes(dataset.id);
                return (
                  <label key={dataset.id} className="flex items-center gap-1.5 text-[11px]">
                    <input type={type === "custom" ? "checkbox" : "radio"} name="tile-dataset" checked={on} onChange={() => {
                      if (type === "custom") { const next = on ? chosen.filter((id) => id !== dataset.id) : [...chosen, dataset.id]; if (next.length) setPicked(next); } else setPicked([dataset.id]);
                      setSpec({ ...current, x: "", y: "" });
                    }} className="accent-[var(--sage)]" />{dataset.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <label className="block text-[11px] text-muted-foreground">Title (optional)
          <input aria-label="Tile title" value={spec.title} onChange={(event) => update({ title: event.target.value })} placeholder="The AI names it if left empty" className={cn(field, "mt-1 text-foreground")} />
        </label>
        {info.fields.includes("category") ? select("Category column", current.x, categories.length ? categories : columns, "x", "Choose a column") : null}
        {info.fields.includes("aggregate") ? (
          <label className="block text-[11px] text-muted-foreground">Calculation
            <select aria-label="Calculation" value={current.agg} onChange={(event) => update({ agg: event.target.value as TileSpec["agg"] })} className={cn(field, "mt-1 text-foreground")}><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count rows</option></select>
          </label>
        ) : null}
        {info.fields.includes("value") && current.agg !== "count" ? select("Number column", current.y, numbers.length ? numbers : columns, "y", "Choose a column") : null}
        {info.fields.includes("number-x") ? select(type === "scatter" ? "X column" : "Number column", current.x, numbers, "x", "Choose a column") : null}
        {info.fields.includes("number-y") ? select("Y column", current.y, numbers, "y", "Choose a column") : null}
        <label className="block text-[11px] text-muted-foreground">{type === "custom" ? "What should it show?" : "Anything else? (optional)"}
          <textarea aria-label={type === "custom" ? "Describe the tile" : "Extra detail"} rows={type === "custom" ? 3 : 2} value={spec.notes} onChange={(event) => update({ notes: event.target.value })}
            placeholder={type === "custom" ? "e.g. share of revenue from the top 3 regions, with the rest grouped as Other" : "e.g. only the top 5, wider than the others"}
            className="mt-1 w-full resize-none rounded-md border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-border-strong" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void build()} disabled={busy || missing.length > 0}>{busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{busy ? "AI is building it…" : "Build with AI"}</Button>
          <p className="text-[11px] text-muted-foreground">{missing.length ? `Still needs ${missing.join(", ")}.` : type === "custom" ? "The AI will write and run a Python script for this." : "The AI checks this against your data and adds the tile."}</p>
        </div>
        {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
