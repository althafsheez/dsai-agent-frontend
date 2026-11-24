"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Check, Hash, LoaderCircle, Pencil, Plus, Sigma, Trash2 } from "lucide-react";
import { runDax } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber } from "../logic/aggregate";
import type { DashboardMeasure, DashboardWidget, DatasetLite, Filters } from "../types";

type Format = NonNullable<DashboardMeasure["format"]>;

export function formatMeasure(value: unknown, format: Format = "number"): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  if (typeof value !== "number") return String(value);
  if (format === "percent") return `${Math.round(value * 1000) / 10}%`;
  return format === "currency" ? `$${formatNumber(value)}` : formatNumber(value);
}

/** The value of a DAX expression right now, with the dashboard's slicers as filter context. */
function useDaxValue(expression: string, measures: DashboardMeasure[], datasetIds: string[], filters: Filters, enabled = true) {
  return useQuery({
    queryKey: ["dax-value", expression, measures, datasetIds, filters],
    queryFn: () => runDax({ expression, datasetIds, measures, filters }),
    enabled: enabled && Boolean(expression.trim()) && datasetIds.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

function Value({ expression, measures, datasetIds, filters, format }: { expression: string; measures: DashboardMeasure[]; datasetIds: string[]; filters: Filters; format?: Format }) {
  const run = useDaxValue(expression, measures, datasetIds, filters);
  if (run.isFetching && !run.data) return <span className="inline-flex items-center gap-1 text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />…</span>;
  if (run.isError) return <span role="alert" className="text-red-300">{run.error instanceof Error ? run.error.message : "Error"}</span>;
  return <span className="font-semibold tabular-nums text-foreground">{formatMeasure(run.data?.rows[0]?.[0], format)}</span>;
}

interface EditorProps {
  initial: DashboardMeasure;
  others: DashboardMeasure[];
  datasetIds: string[];
  filters: Filters;
  onSave: (measure: DashboardMeasure) => void;
  onCancel: () => void;
  note?: string;
}

/** Name, formula and format of one measure, with a Test run before saving. */
function MeasureEditor({ initial, others, datasetIds, filters, onSave, onCancel, note }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [expression, setExpression] = useState(initial.expression);
  const [format, setFormat] = useState<Format>(initial.format ?? "number");
  const [tested, setTested] = useState<string | null>(null);
  const clash = others.some((measure) => measure.name.toLowerCase() === name.trim().toLowerCase());
  const candidate = { name: name.trim() || "Measure", expression, format };
  const test = useDaxValue(tested ?? "", [...others, candidate], datasetIds, filters, tested !== null);
  const field = "w-full rounded-md border bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-border-strong";
  return (
    <div aria-label="Measure editor" role="group" className="space-y-2 rounded-lg border border-border-strong bg-surface/60 p-3">
      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">Name
          <input aria-label="Measure name" value={name} onChange={(event) => { setName(event.target.value); setTested(null); }} className={cn(field, "mt-1")} placeholder="Total Sales" />
        </label>
        <label className="w-28 text-[11px] text-muted-foreground">Format
          <select aria-label="Measure format" value={format} onChange={(event) => setFormat(event.target.value as Format)} className={cn(field, "mt-1")}>
            <option value="number">Number</option><option value="percent">Percent</option><option value="currency">Currency</option>
          </select>
        </label>
      </div>
      <label className="block text-[11px] text-muted-foreground">DAX formula
        <textarea aria-label="DAX formula" value={expression} onChange={(event) => { setExpression(event.target.value); setTested(null); }} spellCheck={false} rows={Math.min(10, Math.max(3, expression.split("\n").length + 1))}
          placeholder="SUM(Sales[Amount])" className={cn(field, "mt-1 resize-y font-mono leading-relaxed")} />
      </label>
      {clash ? <p role="alert" className="text-[11px] text-red-300">Another measure already has this name.</p> : null}
      {tested !== null ? (
        <p className="text-[11px]">Result: {test.isFetching ? <LoaderCircle className="inline size-3 animate-spin" /> : test.isError ? <span role="alert" className="text-red-300">{test.error instanceof Error ? test.error.message : "Error"}</span> : <span className="font-semibold">{formatMeasure(test.data?.rows[0]?.[0], format)}</span>}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!expression.trim()} onClick={() => setTested(`[${candidate.name}]`)}>Test</Button>
        <Button type="button" size="sm" disabled={!name.trim() || !expression.trim() || clash} onClick={() => onSave({ name: name.trim(), expression: expression.trim(), format })}><Check />Save measure</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface MeasuresPanelProps {
  measures: DashboardMeasure[];
  datasets: DatasetLite[];
  filters: Filters;
  /** Missing for viewers: the list is read-only. */
  onChange?: (measures: DashboardMeasure[]) => void;
  onAddTile?: (tile: { title: string; dax: string; datasetId: string; x?: string; grain?: DashboardWidget["grain"] }) => void;
}

/** DAX measures, like Power BI: named formulas that react to the dashboard's filters and can be shown as tiles. */
const GRAINS = ["year", "quarter", "month", "day"] as const;
/** Date columns can be charted over time (by year, quarter, month or day). */
function looksLikeDate(type: string, sample: unknown): boolean {
  return /date|time/i.test(type) || (typeof sample === "string" && /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/.test(sample));
}

export function MeasuresPanel({ measures, datasets, filters, onChange, onAddTile }: MeasuresPanelProps) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [chartFor, setChartFor] = useState<string | null>(null);
  const datasetIds = datasets.map((dataset) => dataset.id);
  const columns = datasets.flatMap((dataset) => dataset.columns.map((column, index) => ({ datasetId: dataset.id, column: column.name, date: looksLikeDate(column.data_type, dataset.rows.find((row) => row[index] != null && row[index] !== "")?.[index]), label: datasets.length > 1 ? `${dataset.name} · ${column.name}` : column.name })));
  const tableNames = datasets.map((dataset) => dataset.name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^0-9A-Za-z_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase());
  const save = (next: DashboardMeasure, previous?: string) => {
    onChange?.(previous ? measures.map((measure) => (measure.name === previous ? next : measure)) : [...measures, next]);
    setEditing(null);
  };

  return (
    <section aria-label="Measures" className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold"><Sigma className="size-3.5" />Measures <span className="font-normal text-muted-foreground">{measures.length}</span></h2>
        {onChange ? <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setEditing("new")}><Plus />New measure</Button> : null}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">DAX formulas, like in Power BI. Each one recalculates for every bar of a chart and for the slicers you pick. Tables: {tableNames.map((name) => <code key={name} className="mx-0.5 rounded bg-raised px-1 font-mono text-foreground">{name}</code>)}</p>

      {editing === "new" ? <MeasureEditor initial={{ name: "", expression: "", format: "number" }} others={measures} datasetIds={datasetIds} filters={filters} onSave={(measure) => save(measure)} onCancel={() => setEditing(null)} /> : null}

      {measures.length ? (
        <ul className="space-y-2">
          {measures.map((measure) => (
            <li key={measure.name}>
              {editing === measure.name ? (
                <MeasureEditor initial={measure} others={measures.filter((item) => item.name !== measure.name)} datasetIds={datasetIds} filters={filters} onSave={(next) => save(next, measure.name)} onCancel={() => setEditing(null)} />
              ) : (
                <article aria-label={`Measure ${measure.name}`} className="rounded-lg border bg-surface/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">{measure.name}</p>
                    <span className="text-xs"><Value expression={`[${measure.name}]`} measures={measures} datasetIds={datasetIds} filters={filters} format={measure.format} /></span>
                  </div>
                  <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 px-2 py-1 font-mono text-[10px] leading-relaxed text-foreground/85">{measure.expression}</pre>
                  {onChange ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {onAddTile ? <button type="button" onClick={() => onAddTile({ title: measure.name, dax: `[${measure.name}]`, datasetId: datasetIds[0] ?? "" })} className="inline-flex h-7 items-center gap-1 rounded-md border bg-surface px-2 text-[11px] hover:border-border-strong"><Hash className="size-3" />Number tile</button> : null}
                      {onAddTile ? (
                        chartFor === measure.name ? (
                          <select autoFocus aria-label={`Chart ${measure.name} by`} defaultValue="" onBlur={() => setChartFor(null)} onChange={(event) => {
                            const [key, grain] = event.target.value.split("@") as [string, DashboardWidget["grain"]];
                            const picked = columns.find((column) => `${column.datasetId}|${column.column}` === key);
                            if (picked) onAddTile({ title: `${measure.name} by ${grain ?? picked.column}`, dax: `[${measure.name}]`, datasetId: picked.datasetId, x: picked.column, grain });
                            setChartFor(null);
                          }} className="h-7 rounded-md border bg-surface px-1.5 text-[11px]">
                            <option value="" disabled>Chart by…</option>
                            {columns.map((column) => <option key={`${column.datasetId}|${column.column}`} value={`${column.datasetId}|${column.column}`}>{column.label}</option>)}
                            {columns.filter((column) => column.date).map((column) => (
                              <optgroup key={`${column.datasetId}|${column.column}@`} label={`${column.label} over time`}>
                                {GRAINS.map((grain) => <option key={grain} value={`${column.datasetId}|${column.column}@${grain}`}>by {grain}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        ) : <button type="button" onClick={() => setChartFor(measure.name)} className="inline-flex h-7 items-center gap-1 rounded-md border bg-surface px-2 text-[11px] hover:border-border-strong"><BarChart3 className="size-3" />Chart by…</button>
                      ) : null}
                      <button type="button" aria-label={`Edit measure ${measure.name}`} onClick={() => setEditing(measure.name)} className="ml-auto grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><Pencil className="size-3.5" /></button>
                      <button type="button" aria-label={`Delete measure ${measure.name}`} onClick={() => onChange(measures.filter((item) => item.name !== measure.name))} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-red-300"><Trash2 className="size-3.5" /></button>
                    </div>
                  ) : null}
                </article>
              )}
            </li>
          ))}
        </ul>
      ) : editing !== "new" ? <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">No measures yet.{onChange ? " Press New measure and write a DAX formula." : ""}</p> : null}
    </section>
  );
}
