"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Database, Folder, Table2, X } from "lucide-react";
import { getPostgresSchemas, getPostgresTable, getPostgresTables } from "@/lib/api";

export type DatabaseTable = { connectionId: string; database: string; schema: string; table: string };
type Source = { id: string; name: string };

function Schema({ source, name, onSelect }: { source: Source; name: string; onSelect: (table: DatabaseTable) => void }) {
  const [open, setOpen] = useState(false);
  const tables = useQuery({ queryKey: ["postgres-schema", source.id, "tables", name, ""], queryFn: () => getPostgresTables(source.id, name, ""), enabled: open, retry: false });
  return <div className="pl-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised"><ChevronDown className={`size-3 ${open ? "" : "-rotate-90"}`} /><Folder className="size-3.5" />{name}</button>
    {open && <div className="pl-5">
      {tables.isPending && <p role="status" className="px-2 text-xs text-muted-foreground">Loading tables…</p>}
      {tables.error && <p role="alert" className="px-2 text-xs text-red-300">{tables.error.message}</p>}
      {tables.data?.items.map((table) => <button key={table.name} type="button" onClick={() => onSelect({ connectionId: source.id, database: source.name, schema: name, table: table.name })} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised"><Table2 className="size-3.5" />{table.name}</button>)}
      {tables.data?.truncated && <p className="px-2 text-xs text-muted-foreground">More tables are available in Extensions.</p>}
      {tables.data?.items.length === 0 && <p className="px-2 text-xs text-muted-foreground">No tables available.</p>}
    </div>}
  </div>;
}

function DatabaseSource({ source, onSelect }: { source: Source; onSelect: (table: DatabaseTable) => void }) {
  const [open, setOpen] = useState(false);
  const schemas = useQuery({ queryKey: ["postgres-schema", source.id, "names"], queryFn: () => getPostgresSchemas(source.id), enabled: open, retry: false });
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised"><ChevronDown className={`size-3 ${open ? "" : "-rotate-90"}`} /><Database className="size-3.5 text-slate" />{source.name}</button>
    {open && <div>
      {schemas.isPending && <p role="status" className="px-6 text-xs text-muted-foreground">Loading schemas…</p>}
      {schemas.error && <p role="alert" className="px-6 text-xs text-red-300">{schemas.error.message}</p>}
      {schemas.data?.items.map((schema) => <Schema key={schema} source={source} name={schema} onSelect={onSelect} />)}
      {schemas.data?.truncated && <p className="px-6 text-xs text-muted-foreground">More schemas are available in Extensions.</p>}
      {schemas.data?.items.length === 0 && <p className="px-6 text-xs text-muted-foreground">No schemas available.</p>}
    </div>}
  </div>;
}

export function DatabaseSources({ sources, onSelect }: { sources: Source[]; onSelect: (table: DatabaseTable) => void }) {
  if (!sources.length) return null;
  return <section aria-label="Databases" className="px-4 pb-2"><h3 className="flex items-center gap-2 py-2 text-xs font-medium"><Database className="size-3.5" /> Databases</h3>{sources.map((source) => <DatabaseSource key={source.id} source={source} onSelect={onSelect} />)}</section>;
}

export function DatabaseTablePreview({ table, onBack, onClose }: { table: DatabaseTable; onBack: () => void; onClose: () => void }) {
  const [preview, setPreview] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["postgres-schema", table.connectionId, "table", table.schema, table.table, preview],
    queryFn: () => getPostgresTable(table.connectionId, table.schema, table.table, preview),
    retry: false,
  });

  return (
    <aside aria-label="Database table preview" className="flex h-full min-h-0 flex-col border-l bg-sidebar text-sidebar-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <button type="button" onClick={onBack} aria-label="Back to context" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{table.schema}.{table.table}</h2>
        <button type="button" onClick={onClose} aria-label="Close preview" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><X className="size-4" /></button>
      </header>

      <div className="shrink-0 border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface"><Table2 className="size-4 text-slate" /></span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{table.table}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{table.database} · {table.schema}</p>
          </div>
        </div>
        {detail.data && (
          <div className="mt-4 rounded-lg border bg-surface/50">
            <button type="button" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-raised/60">
              <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${columnsOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
              Columns <span className="ml-auto font-normal text-muted-foreground">{detail.data.columns.length}</span>
            </button>
            {columnsOpen && (
              <div className="max-h-48 overflow-auto border-t">
                <table aria-label="Table columns" className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-raised text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Column</th><th scope="col" className="px-3 py-2 font-medium">Type</th><th scope="col" className="px-3 py-2 font-medium">Details</th></tr></thead>
                  <tbody>{detail.data.columns.map((column) => (
                    <tr key={column.name} className="border-t border-border/50">
                      <th scope="row" className="break-all px-3 py-2 font-medium">{column.name}</th>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{column.data_type}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{[column.primary_key ? "Primary key" : "", column.nullable ? "Nullable" : "Not null"].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <section aria-label="Rows" className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold">Rows</h3>
            {detail.data?.preview && <p className="mt-1 text-[11px] text-muted-foreground">{detail.data.preview.rows.length} rows shown{detail.data.preview.truncated ? " · Preview limited to a sample" : ""}</p>}
          </div>
          {!preview && detail.data && <button type="button" onClick={() => setPreview(true)} className="rounded-md border bg-surface px-3 py-1.5 text-xs hover:bg-raised">Preview rows</button>}
        </div>
        {detail.isPending && <p role="status" className="text-xs text-muted-foreground">Loading table…</p>}
        {detail.error && <p role="alert" className="text-xs text-red-300">{detail.error.message}</p>}
        {!preview && detail.data && <p className="text-xs text-muted-foreground">Preview rows to inspect a sample of this table.</p>}
        {detail.data?.preview && (
          <div tabIndex={0} className="min-h-0 flex-1 overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <table aria-label="Table preview" className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-raised text-muted-foreground"><tr>{detail.data.preview.columns.map((name, index) => <th key={index} scope="col" className="whitespace-nowrap border-b px-3 py-2 font-medium">{name}</th>)}</tr></thead>
              <tbody>{detail.data.preview.rows.map((row, index) => (
                <tr key={index} className="border-b border-border/50 hover:bg-raised/40">{row.map((value, column) => {
                  const display = value === null ? "NULL" : typeof value === "object" ? JSON.stringify(value) : String(value);
                  return <td key={column} title={display} className="max-w-52 truncate whitespace-nowrap px-3 py-2">{display}</td>;
                })}</tr>
              ))}</tbody>
            </table>
            {detail.data.preview.rows.length === 0 && <p className="p-3 text-xs text-muted-foreground">No rows to display.</p>}
          </div>
        )}
      </section>
    </aside>
  );
}
