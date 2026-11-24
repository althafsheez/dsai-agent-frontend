"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code2, Database, Play, Table2, Trash2, X } from "lucide-react";
import { getSqlTables } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CHART_LABEL, numberLikeColumns, numericColumns } from "../logic/aggregate";
import { generatedSql, tableFor } from "../logic/sql";
import { GROUPED_TYPES, usedDatasetIds } from "../types";
import type { DashboardWidget, DatasetLite, WidgetLayout, WidgetType } from "../types";
import { retype } from "./widget-card";

const select = "h-8 w-full rounded-md border bg-surface px-2 text-xs outline-none focus:border-border-strong";
const label = "mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
const area = "min-h-32 w-full resize-y rounded-md border bg-surface p-2 font-mono text-[11px] leading-snug outline-none focus:border-border-strong";
const TYPES = Object.keys(CHART_LABEL).filter((type) => type !== "custom") as WidgetType[];

interface WidgetEditorProps {
  /** The tile's cell on the grid; changes go through the grid so tiles never overlap. */
  layout?: WidgetLayout;
  onLayout?: (layout: WidgetLayout) => void;
  widget: DashboardWidget;
  /** Every dataset the dashboard can use. */
  datasets: DatasetLite[];
  onChange: (widget: DashboardWidget) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Everything about one widget in one place: which tables it reads, the query behind it (visual, SQL or Python), its type and width. */
export function WidgetEditor({ widget, datasets, onChange, onRemove, onClose, layout, onLayout }: WidgetEditorProps) {
  const ids = usedDatasetIds([widget]);
  const dataset = datasets.find((item) => item.id === widget.dataset_id);
  const available = datasets.map((item) => item.id);
  const tables = useQuery({ queryKey: ["sql-tables", available], queryFn: () => getSqlTables(available), enabled: available.length > 0, staleTime: 60_000, retry: false });
  const table = tableFor(widget, tables.data ?? []);
  const others = (tables.data ?? []).filter((entry) => !ids.includes(entry.dataset_id));
  /** A query may read any dataset of the dashboard: the widget then lists every table the query names. */
  const withReferencedTables = (next: DashboardWidget, sql: string): DashboardWidget => {
    const referenced = (tables.data ?? []).filter((entry) => new RegExp(`\\b${entry.table}\\b`, "i").test(sql)).map((entry) => entry.dataset_id);
    const all = [...new Set([next.dataset_id, ...referenced])];
    return { ...next, sql, datasets: all.length > 1 ? all : undefined };
  };
  const isScript = widget.type === "custom";
  const [sqlText, setSqlText] = useState(widget.sql ?? "");
  const [scriptText, setScriptText] = useState(widget.script ?? "");
  useEffect(() => { setSqlText(widget.sql ?? ""); setScriptText(widget.script ?? ""); }, [widget.id, widget.sql, widget.script]);

  const numbers = dataset ? [...new Set([...numericColumns(dataset), ...numberLikeColumns(dataset)])] : [];
  const allColumns = dataset?.columns.map((column) => column.name) ?? [];
  const grouped = GROUPED_TYPES.includes(widget.type);
  const visual = !isScript && !widget.sql;
  const startingSql = table ? generatedSql(widget, table.table) : "";

  const pick = (name: string, value: string | undefined, options: string[], key: "x" | "y") => (
    <div><label className={label}>{name}<select aria-label={name} value={value ?? ""} onChange={(event) => onChange({ ...widget, [key]: event.target.value })} className={cn(select, "mt-1 normal-case tracking-normal")}>{!value ? <option value="">Pick a column</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div>
  );

  return (
    <section aria-label="Edit widget" className="border-b">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <Code2 className="size-4 shrink-0 text-muted-foreground" />
        <input aria-label="Widget title" value={widget.title} onChange={(event) => onChange({ ...widget, title: event.target.value })} className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium outline-none hover:border-border focus:border-border-strong" />
        <button type="button" aria-label="Close widget editor" onClick={onClose} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-4" /></button>
      </header>

      <div className="space-y-4 p-3">
        <div>
          <p className={label}>Datasets and tables used</p>
          {ids.length ? (
            <ul className="space-y-1.5">
              {ids.map((id) => {
                const item = datasets.find((entry) => entry.id === id);
                const info = tables.data?.find((entry) => entry.dataset_id === id);
                return (
                  <li key={id} className="rounded-lg border bg-background/40 p-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium"><Table2 className="size-3.5 shrink-0 text-sage" /><span className="truncate"><span className="font-normal text-muted-foreground">Dataset </span>{item?.name ?? "Unavailable dataset"}</span></p>
                    {info ? <p className="mt-0.5 text-[10px] text-muted-foreground">Table <code className="rounded bg-raised px-1 font-mono text-foreground">{info.table}</code></p> : null}
                    {item ? <p className="mt-1 flex flex-wrap gap-1">{item.columns.map((column) => <span key={column.name} className={cn("rounded border px-1.5 py-px text-[10px]", [widget.x, widget.y].includes(column.name) && !widget.sql ? "border-sage/60 text-foreground" : "text-muted-foreground")} title={column.name}>{column.name}</span>)}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-xs text-muted-foreground">This widget does not read a dataset.</p>}
          {visual && datasets.length > 1 ? (
            <label className="mt-2 block"><span className={label}>Dataset</span>
              <select aria-label="Dataset" value={widget.dataset_id} onChange={(event) => { const next = datasets.find((item) => item.id === event.target.value); if (next) onChange(retype({ ...widget, dataset_id: next.id, x: undefined, y: undefined }, widget.type, next)); }} className={select}>
                {datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>

        <div>
          <p className={label}>Query</p>
          {visual ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {grouped ? pick("Category column", widget.x, allColumns, "x") : null}
                {grouped ? (
                  <div><label className={label}>Aggregate<select aria-label="Aggregate" value={widget.agg} onChange={(event) => onChange({ ...widget, agg: event.target.value as DashboardWidget["agg"] })} className={cn(select, "mt-1 normal-case tracking-normal")}><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count of rows</option></select></label></div>
                ) : null}
                {grouped && widget.agg !== "count" ? pick("Value column", widget.y, allColumns, "y") : null}
                {widget.type === "kpi" ? (
                  <>
                    <div><label className={label}>Aggregate<select aria-label="Aggregate" value={widget.agg} onChange={(event) => onChange({ ...widget, agg: event.target.value as DashboardWidget["agg"] })} className={cn(select, "mt-1 normal-case tracking-normal")}><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count of rows</option></select></label></div>
                    {widget.agg !== "count" ? pick("Value column", widget.y, allColumns, "y") : null}
                  </>
                ) : null}
                {widget.type === "histogram" ? pick("Numeric column", widget.x, numbers, "x") : null}
                {widget.type === "scatter" ? <>{pick("X column", widget.x, numbers, "x")}{pick("Y column", widget.y, numbers, "y")}</> : null}
                {widget.type === "gauge" ? pick("Value column", widget.y, numbers, "y") : null}
              </div>
              {widget.type === "table" ? <p className="text-[11px] text-muted-foreground">Shows the first rows of the table.</p> : null}
              {startingSql ? (
                <details open className="rounded-md border bg-background/40 text-[11px]">
                  <summary className="cursor-pointer px-2 py-1.5 text-muted-foreground hover:text-foreground">Query this widget runs (SQL)</summary>
                  <pre className="overflow-auto border-t px-2 py-1.5 font-mono text-[10px] leading-snug">{startingSql}</pre>
                  <div className="border-t p-1.5"><button type="button" onClick={() => onChange(withReferencedTables(widget, startingSql))} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-surface px-2 text-[11px] hover:border-border-strong"><Code2 className="size-3.5" />Edit as SQL</button></div>
                </details>
              ) : null}
            </div>
          ) : null}

          {widget.sql !== undefined && !isScript ? (
            <div className="space-y-2">
              <textarea aria-label="SQL query" spellCheck={false} value={sqlText} onChange={(event) => setSqlText(event.target.value)} className={area} />
              {others.length ? (
                <details className="rounded-md border bg-background/40 text-[11px]">
                  <summary className="cursor-pointer px-2 py-1.5 text-muted-foreground hover:text-foreground">Other tables you can join ({others.length})</summary>
                  <ul className="space-y-1 border-t p-2">{others.map((entry) => <li key={entry.dataset_id}><code className="rounded bg-raised px-1 font-mono text-foreground">{entry.table}</code> <span className="text-muted-foreground">({entry.columns.join(", ")})</span></li>)}</ul>
                </details>
              ) : null}
              <p className="text-[10px] text-muted-foreground">One read-only SELECT. {widget.type === "kpi" ? "First cell is the value." : widget.type === "table" ? "Every column is shown." : widget.type === "scatter" ? "Two number columns: x, y." : widget.type === "gauge" ? "First cell is the value, second the maximum." : "Two columns: a label, then a number."}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!sqlText.trim() || sqlText === widget.sql} onClick={() => onChange(withReferencedTables(widget, sqlText))} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"><Play className="size-3.5" />Run & apply</button>
                <button type="button" onClick={() => onChange({ ...widget, sql: undefined, datasets: undefined })} className="inline-flex h-8 items-center rounded-md border bg-surface px-3 text-xs hover:border-border-strong">Back to visual query</button>
              </div>
            </div>
          ) : null}

          {isScript ? (
            <div className="space-y-2">
              {widget.request ? <p className="text-[11px] text-muted-foreground">Asked for: {widget.request}</p> : null}
              <textarea aria-label="Python script" spellCheck={false} value={scriptText} onChange={(event) => setScriptText(event.target.value)} className={cn(area, "min-h-44")} />
              <button type="button" disabled={!scriptText.trim() || scriptText === widget.script} onClick={() => onChange({ ...widget, script: scriptText })} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"><Play className="size-3.5" />Run & apply</button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!isScript ? (
            <label className="block"><span className={label}>Chart type</span>
              <select aria-label="Chart type" value={widget.type} onChange={(event) => onChange(dataset && !widget.sql ? retype(widget, event.target.value as WidgetType, dataset) : { ...widget, type: event.target.value as WidgetType })} className={select}>
                {TYPES.map((type) => <option key={type} value={type}>{CHART_LABEL[type]}</option>)}
              </select>
            </label>
          ) : null}
          {layout && onLayout ? (
            <div><span className={label}>Size (columns × rows)</span>
              <div role="group" aria-label="Size" className="flex items-center gap-1.5">
                <input type="number" min={1} max={12} aria-label="Columns" value={layout.w} onChange={(event) => onLayout({ ...layout, w: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} className="h-8 w-14 rounded-md border bg-surface px-2 text-xs" />
                <span className="text-xs text-muted-foreground">×</span>
                <input type="number" min={2} aria-label="Rows" value={layout.h} onChange={(event) => onLayout({ ...layout, h: Math.max(2, Number(event.target.value) || 2) })} className="h-8 w-14 rounded-md border bg-surface px-2 text-xs" />
              </div>
            </div>
          ) : null}
        </div>

        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" />Remove widget</button>
        <p className="flex items-center gap-1.5 border-t pt-2 text-[10px] text-muted-foreground"><Database className="size-3 shrink-0" />Changes apply right away; press Done or Save draft to keep them.</p>
      </div>
    </section>
  );
}
