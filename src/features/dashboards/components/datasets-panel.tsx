"use client";

import { ArrowLeft, ChevronDown, Code2, FileSpreadsheet, Pencil, Plus, Search, Table2, X } from "lucide-react";
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
  /** Which list to show; the side panel's own tabs choose it. */
  view: "datasets" | "library";
  /** Switches the side panel to the Library list (from the Add dataset menu or the empty state). */
  onShowLibrary: () => void;
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
export function DatasetsPanel({ attached, library, usage, onAttach, onDetach, onUploaded, onDrive, readOnly = false, canAdd = !readOnly, widgets = [], onEditWidget, view, onShowLibrary }: DatasetsPanelProps) {
  const tab = view;
  const setTab = (next: Tab) => { if (next === "library") onShowLibrary(); };
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const available = library.filter((dataset) => !attached.some((item) => item.id === dataset.id));
  const search = query.trim().toLowerCase();
  const shown = available.filter((dataset) => !search || dataset.name.toLowerCase().includes(search));

  const previewed = previewId ? library.find((dataset) => dataset.id === previewId) ?? attached.find((dataset) => dataset.id === previewId) : undefined;
  if (previewed) {
    const loaded = attached.some((dataset) => dataset.id === previewed.id);
    return (
      <DatasetPreview
        dataset={previewed} widgets={widgets.filter((widget) => usedDatasetIds([widget]).includes(previewed.id))}
        onBack={() => setPreviewId(null)} onEditWidget={onEditWidget}
        onLoad={!loaded && canAdd ? () => { onAttach(previewed.id); setPreviewId(null); } : undefined}
      />
    );
  }

  return (
    <section aria-label={tab === "library" ? "Library" : "Datasets"} className="border-b">
      {tab === "datasets" ? (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-xs font-medium">Datasets used <span className="font-normal tabular-nums text-muted-foreground">{attached.length}</span></p>
          {canAdd ? <AddDatasetMenu onUploaded={onUploaded} onDrive={onDrive} onLibrary={onShowLibrary} /> : null}
        </div>
      ) : null}

      {tab === "datasets" ? (
        attached.length ? (
          <ul aria-label="Datasets used by this dashboard" className="pb-2">
            {attached.map((dataset) => {
              const count = usage[dataset.id] ?? 0;
              return (
                <li key={dataset.id}>
                  <div className="group flex w-full items-center gap-2.5 px-4 py-2 hover:bg-raised/70">
                    <button type="button" aria-label={`Show ${dataset.name}`} onClick={() => setPreviewId(dataset.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <DatasetIcon />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground" title={dataset.name}>{dataset.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{size(dataset)} · {count ? `used by ${count} widget${count === 1 ? "" : "s"}` : "not used yet"}</span>
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 -rotate-90 text-muted-foreground" />
                    </button>
                    {count === 0 && !readOnly ? <button type="button" aria-label={`Remove ${dataset.name}`} title="Remove from this dashboard" onClick={() => onDetach(dataset.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"><X className="size-4" /></button> : null}
                  </div>
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
          {tab === "library" ? <p className="px-4 pt-2.5 pb-1.5 text-xs font-medium">Load from your Library <span className="font-normal tabular-nums text-muted-foreground">{available.length}</span></p> : null}
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

/** One dataset opened up, like the chat's table preview: what it is, its columns, what it builds, the queries, and its rows. */
function DatasetPreview({ dataset, widgets, onBack, onEditWidget, onLoad }: { dataset: DatasetLite; widgets: DashboardWidget[]; onBack: () => void; onEditWidget?: (id: string) => void; onLoad?: () => void }) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const tables = useQuery({ queryKey: ["sql-tables", [dataset.id]], queryFn: () => getSqlTables([dataset.id]), staleTime: 60_000, retry: false });
  const table = tables.data?.find((entry) => entry.dataset_id === dataset.id)?.table;
  const usedBy = (column: string) => widgets.filter((widget) => readsColumn(widget, column)).map((widget) => widget.title);
  const label = "mb-1.5 text-xs font-semibold";
  return (
    <section aria-label={`${dataset.name} preview`} className="flex flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <button type="button" onClick={onBack} aria-label="Back to datasets" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-raised hover:text-foreground"><ArrowLeft className="size-4" />Back</button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{dataset.name}</h2>
        {onLoad ? <button type="button" onClick={onLoad} className="inline-flex h-7 items-center gap-1 rounded-md border bg-surface px-2 text-[11px] font-medium hover:border-border-strong"><Plus className="size-3" />Load</button> : null}
      </header>

      <div className="space-y-4 border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface"><Table2 className="size-4 text-sage" /></span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{dataset.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{size(dataset)}{table ? <> · SQL table <code className="rounded bg-raised px-1 font-mono text-foreground">{table}</code></> : null}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-surface/50">
          <button type="button" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-raised/60">
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !columnsOpen && "-rotate-90")} aria-hidden="true" />
            Columns <span className="ml-auto font-normal text-muted-foreground">{dataset.columns.length}</span>
          </button>
          {columnsOpen ? (
            <div className="max-h-56 overflow-auto border-t">
              <table aria-label="Dataset columns" className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-raised text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Column</th><th scope="col" className="px-3 py-2 font-medium">Type</th><th scope="col" className="px-3 py-2 font-medium">Used by</th></tr></thead>
                <tbody>{dataset.columns.map((column) => {
                  const used = usedBy(column.name);
                  return (
                    <tr key={column.name} className="border-t border-border/50">
                      <th scope="row" className={cn("whitespace-nowrap px-3 py-2 font-medium", used.length && "text-sage")}>{column.name}</th>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{column.data_type}</td>
                      <td className="px-3 py-2 text-muted-foreground">{used.length ? used.join(", ") : "—"}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : null}
        </div>
        {!onLoad ? (
          <div>
            <h3 className={label}>Used to build</h3>
            {widgets.length ? (
              <ul className="flex flex-wrap gap-1">{widgets.map((widget) => <li key={widget.id} className="rounded-full border border-sage/40 bg-sage/5 px-2 py-0.5 text-[10px] text-foreground">{widget.title}</li>)}</ul>
            ) : <p className="text-[11px] text-muted-foreground">No tile uses this dataset yet.</p>}
          </div>
        ) : null}
        {widgets.length && !onLoad ? (
          <div>
            <h3 className={label}>Queries used to build</h3>
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
                      {onEditWidget ? <div className="border-t px-2 py-1.5"><button type="button" onClick={() => onEditWidget(widget.id)} className="text-[11px] text-sage hover:underline">Change this {language === "Python" ? "script" : "query"}</button></div> : null}
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <section aria-label="Rows" className="px-4 py-4">
        <h3 className="text-xs font-semibold">Rows</h3>
        <p className="mb-3 mt-1 text-[11px] text-muted-foreground">{dataset.rows.length} rows shown{(dataset.row_count ?? dataset.rows.length) > dataset.rows.length ? ` of ${(dataset.row_count ?? 0).toLocaleString()} · Preview limited to a sample` : ""}</p>
        <div tabIndex={0} className="max-h-[28rem] overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <table aria-label="Dataset preview" className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-raised text-muted-foreground"><tr>{dataset.columns.map((column) => <th key={column.name} scope="col" className="whitespace-nowrap border-b px-3 py-2 font-medium">{column.name}</th>)}</tr></thead>
            <tbody>{dataset.rows.map((row, index) => (
              <tr key={index} className="border-b border-border/50 hover:bg-raised/40">{row.map((value, column) => {
                const display = value === null ? "NULL" : String(value);
                return <td key={column} title={display} className="max-w-52 truncate whitespace-nowrap px-3 py-2 tabular-nums">{display}</td>;
              })}</tr>
            ))}</tbody>
          </table>
          {dataset.rows.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No rows to display.</p> : null}
        </div>
      </section>
    </section>
  );
}

/** Read-only "about this tile": the datasets and tables it reads, the columns it uses, and its query or script. */
export function WidgetInfo({ widget, datasets, onClose, onEdit }: { widget: DashboardWidget; datasets: DatasetLite[]; onClose: () => void; onEdit?: () => void }) {
  const ids = usedDatasetIds([widget]);
  const tables = useQuery({ queryKey: ["sql-tables", ids], queryFn: () => getSqlTables(ids), enabled: ids.length > 0, staleTime: 60_000, retry: false });
  const first = tables.data?.find((entry) => entry.dataset_id === widget.dataset_id)?.table;
  const { language, code } = queryOf(widget, first);
  const label = "mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
  return (
    <section aria-label={`About ${widget.title}`} className="border-b">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <Code2 className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</h2>
        <button type="button" aria-label="Close tile details" onClick={onClose} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-4" /></button>
      </header>
      <div className="space-y-4 p-3">
        <div>
          <p className={label}>Datasets and tables used</p>
          {ids.length ? (
            <ul className="space-y-1.5">
              {ids.map((id) => {
                const dataset = datasets.find((item) => item.id === id);
                const table = tables.data?.find((entry) => entry.dataset_id === id)?.table;
                return (
                  <li key={id} className="rounded-lg border bg-background/40 p-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium"><FileSpreadsheet className="size-3.5 shrink-0 text-sage" /><span className="truncate">{dataset?.name ?? "Unavailable dataset"}</span></p>
                    {table ? <p className="mt-0.5 text-[10px] text-muted-foreground">Table <code className="rounded bg-raised px-1 font-mono text-foreground">{table}</code></p> : null}
                    {dataset ? <p className="mt-1 flex flex-wrap gap-1">{dataset.columns.map((column) => <span key={column.name} className={cn("rounded border px-1.5 py-px text-[10px]", readsColumn(widget, column.name) ? "border-sage/60 text-foreground" : "text-muted-foreground")}>{column.name}</span>)}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-xs text-muted-foreground">This tile does not read a dataset.</p>}
        </div>
        <div>
          <p className={label}>{language === "Python" ? "Python script" : widget.sql ? "SQL query" : "Query (SQL equivalent)"}</p>
          {widget.request ? <p className="mb-1 text-[11px] text-muted-foreground">Asked for: {widget.request}</p> : null}
          <pre aria-label="Tile code" className="max-h-80 overflow-auto rounded-md border bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-foreground/90">{code || "No query."}</pre>
        </div>
        {onEdit ? <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1.5 text-xs hover:border-border-strong"><Pencil className="size-3.5" />Change the query</button> : null}
      </div>
    </section>
  );
}
