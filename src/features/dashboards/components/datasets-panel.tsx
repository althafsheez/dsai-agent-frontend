"use client";

import { ChevronDown, FileSpreadsheet, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSqlTables } from "@/lib/api";
import { cn } from "@/lib/utils";
import { generatedSql } from "../logic/sql";
import { usedDatasetIds } from "../types";
import type { DashboardWidget, DatasetLite } from "../types";
import { AddDatasetMenu } from "./add-dataset-menu";

interface DatasetsPanelProps {
  /** Datasets attached to this dashboard (used by a widget or added for the AI to use). */
  attached: DatasetLite[];
  /** Everything in the Library, for the Library tab. */
  library: DatasetLite[];
  /** How many widgets read each dataset id. */
  usage: Record<string, number>;
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  onUploaded: () => void;
  onDrive: () => void;
  /** Published view: no removing, and no adding unless `canAdd`. */
  readOnly?: boolean;
  canAdd?: boolean;
  /** The dashboard's widgets, to show what each dataset was used to build. */
  widgets?: DashboardWidget[];
  /** Opens a widget's editor, where its query or script can be changed. */
  onEditWidget?: (id: string) => void;
}

type Tab = "datasets" | "library";

function DatasetIcon() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface">
      <FileSpreadsheet className="size-3.5 text-sage" strokeWidth={1.6} />
    </span>
  );
}

const size = (dataset: DatasetLite) => `${(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows · ${dataset.columns.length} columns`;

/** The data this dashboard uses, and the Library to load more from, as two tabs. */
export function DatasetsPanel({ attached, library, usage, onAttach, onDetach, onUploaded, onDrive, readOnly = false, canAdd = !readOnly, widgets = [], onEditWidget }: DatasetsPanelProps) {
  const [tab, setTab] = useState<Tab>("datasets");
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const available = library.filter((dataset) => !attached.some((item) => item.id === dataset.id));
  const search = query.trim().toLowerCase();
  const shown = available.filter((dataset) => !search || dataset.name.toLowerCase().includes(search));
  const tabs: Array<[Tab, string, number]> = canAdd ? [["datasets", "Datasets", attached.length], ["library", "Library", available.length]] : [["datasets", "Datasets", attached.length]];

  return (
    <section aria-label="Datasets" className="border-b">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div role="tablist" aria-label="Dataset sources" className="flex min-w-0 flex-1 rounded-lg border bg-surface p-0.5">
          {tabs.map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={cn("flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors", tab === id ? "bg-raised font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}<span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
        {canAdd ? <AddDatasetMenu onUploaded={onUploaded} onDrive={onDrive} onLibrary={() => setTab("library")} /> : null}
      </div>

      {tab === "datasets" ? (
        attached.length ? (
          <ul aria-label="Datasets used by this dashboard" className="pb-2">
            {attached.map((dataset) => {
              const count = usage[dataset.id] ?? 0;
              return (
                <li key={dataset.id}>
                  <div className={cn("group flex w-full items-center gap-2.5 px-4 py-2 hover:bg-raised/70", openId === dataset.id && "bg-raised/50")}>
                    <button type="button" aria-expanded={openId === dataset.id} aria-label={`Show ${dataset.name}`} onClick={() => setOpenId(openId === dataset.id ? null : dataset.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <DatasetIcon />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground" title={dataset.name}>{dataset.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{size(dataset)} · {count ? `used by ${count} widget${count === 1 ? "" : "s"}` : "not used yet"}</span>
                      </span>
                      <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", openId !== dataset.id && "-rotate-90")} />
                    </button>
                    {count === 0 && !readOnly ? <button type="button" aria-label={`Remove ${dataset.name}`} title="Remove from this dashboard" onClick={() => onDetach(dataset.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"><X className="size-4" /></button> : null}
                  </div>
                  {openId === dataset.id ? <DatasetDetail dataset={dataset} widgets={widgets.filter((widget) => usedDatasetIds([widget]).includes(dataset.id))} onEditWidget={onEditWidget} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            {canAdd ? <>No datasets yet. <button type="button" onClick={() => setTab("library")} className="text-foreground underline-offset-2 hover:underline">Load one from the Library</button> or use Add.</> : "No datasets."}
          </p>
        )
      ) : (
        <div className="pb-2">
          {available.length > 4 ? (
            <label className="relative mx-3 mb-1.5 block">
              <span className="sr-only">Search the Library</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the Library…" className="h-8 w-full rounded-md border bg-surface pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong" />
            </label>
          ) : null}
          {shown.length ? (
            <ul aria-label="Library datasets" className="max-h-80 overflow-y-auto">
              {shown.map((dataset) => (
                <li key={dataset.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-raised/70">
                  <DatasetIcon />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground" title={dataset.name}>{dataset.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{size(dataset)}</span>
                  </span>
                  <button type="button" aria-label={`Load ${dataset.name}`} onClick={() => onAttach(dataset.id)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border bg-surface px-2 text-[11px] font-medium hover:border-border-strong">
                    <Plus className="size-3" />Load
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 pb-2 text-[11px] text-muted-foreground">{available.length ? "No matches." : "Every Library dataset is already loaded."}</p>}
        </div>
      )}
    </section>
  );
}

/** Which columns a widget reads: its chosen fields, or any column named in its SQL or script. */
const readsColumn = (widget: DashboardWidget, column: string) =>
  [widget.x, widget.y].includes(column) || [widget.sql, widget.script].some((text) => text?.includes(column));

/** The code behind a widget: its own SQL or Python, or the SQL its visual settings are equal to. */
function queryOf(widget: DashboardWidget, table: string | undefined): { language: "SQL" | "Python"; code: string } {
  if (widget.script) return { language: "Python", code: widget.script };
  if (widget.sql) return { language: "SQL", code: widget.sql };
  return { language: "SQL", code: table ? generatedSql(widget, table) : "" };
}

/** One dataset opened up: the SQL table, the widgets built from it, its columns (used ones marked) and its first rows. */
function DatasetDetail({ dataset, widgets, onEditWidget }: { dataset: DatasetLite; widgets: DashboardWidget[]; onEditWidget?: (id: string) => void }) {
  const tables = useQuery({ queryKey: ["sql-tables", [dataset.id]], queryFn: () => getSqlTables([dataset.id]), staleTime: 60_000, retry: false });
  const table = tables.data?.find((entry) => entry.dataset_id === dataset.id)?.table;
  const usedBy = (column: string) => widgets.filter((widget) => readsColumn(widget, column)).map((widget) => widget.title);
  const rows = dataset.rows.slice(0, 8);
  return (
    <div aria-label={`${dataset.name} details`} className="mx-3 mb-2 space-y-3 rounded-lg border bg-background/40 p-3">
      {table ? <p className="text-[11px] text-muted-foreground">SQL table <code className="rounded bg-raised px-1 font-mono text-foreground">{table}</code></p> : null}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Used to build</p>
        {widgets.length ? (
          <ul className="flex flex-wrap gap-1">{widgets.map((widget) => <li key={widget.id} className="rounded-full border border-sage/40 bg-sage/5 px-2 py-0.5 text-[10px] text-foreground">{widget.title}</li>)}</ul>
        ) : <p className="text-[11px] text-muted-foreground">No widget uses this dataset yet.</p>}
      </div>
      {widgets.length ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Queries used to build</p>
          <ul aria-label="Queries used to build" className="space-y-1">
            {widgets.map((widget) => {
              const { language, code } = queryOf(widget, table);
              return (
                <li key={widget.id}>
                  <details className="group rounded-md border bg-surface/60">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[11px]">
                      <ChevronDown className="size-3 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{widget.title}</span>
                      <span className="shrink-0 rounded border px-1 text-[9px] uppercase text-muted-foreground">{language}</span>
                    </summary>
                    <pre className="max-h-48 overflow-auto border-t px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/90">{code || "No query yet."}</pre>
                    {onEditWidget ? <div className="border-t px-2 py-1.5"><button type="button" onClick={() => onEditWidget(widget.id)} className="text-[11px] text-sage hover:underline">Edit this {language === "Python" ? "script" : "query"}</button></div> : null}
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Columns <span className="normal-case tracking-normal">· highlighted ones are used</span></p>
        <ul className="flex flex-wrap gap-1">
          {dataset.columns.map((column) => {
            const used = usedBy(column.name);
            return <li key={column.name} title={used.length ? `Used by ${used.join(", ")}` : `${column.data_type}, not used`} className={cn("rounded border px-1.5 py-px text-[10px]", used.length ? "border-sage/60 text-foreground" : "text-muted-foreground")}>{column.name}</li>;
          })}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview <span className="normal-case tracking-normal">· first {rows.length} of {(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows</span></p>
        <div className="max-h-56 overflow-auto rounded-md border">
          <table className="w-full border-collapse text-[10px]">
            <thead className="sticky top-0 bg-surface">
              <tr>{dataset.columns.map((column) => <th key={column.name} scope="col" className={cn("whitespace-nowrap border-b px-2 py-1 text-left font-medium", usedBy(column.name).length ? "text-sage" : "text-muted-foreground")}>{column.name}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => <tr key={index} className="odd:bg-raised/30">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-2 py-1 tabular-nums text-foreground/90">{cell === null ? "—" : String(cell)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
