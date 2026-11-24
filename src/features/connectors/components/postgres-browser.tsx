"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getPostgresSchemas, getPostgresTable, getPostgresTables, refreshPostgresSchema, type PostgresConnection, type PostgresTable } from "@/lib/api";
import { connectionInput } from "./postgres-setup";

function cell(value: unknown): string {
  if (value === null) return "NULL";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function PostgresBrowser({ connection, onClose }: { connection: PostgresConnection; onClose: () => void }) {
  const queryClient = useQueryClient();
  const root = ["postgres-schema", connection.id];
  const [schema, setSchema] = useState("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PostgresTable | null>(null);
  const [preview, setPreview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const schemas = useQuery({ queryKey: [...root, "names"], queryFn: () => getPostgresSchemas(connection.id), retry: false });
  const tables = useQuery({
    queryKey: [...root, "tables", schema, search], queryFn: () => getPostgresTables(connection.id, schema, search), retry: false,
  });
  const detail = useQuery({
    queryKey: [...root, "table", selected?.schema_name, selected?.name, preview],
    queryFn: () => getPostgresTable(connection.id, selected!.schema_name, selected!.name, preview),
    enabled: selected !== null, retry: false,
  });

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      const updated = await refreshPostgresSchema(connection.id);
      if (!updated.items.includes(schema)) setSchema("");
      await queryClient.invalidateQueries({ queryKey: root });
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh the PostgreSQL schema.");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["postgres-connections"] });
      setRefreshing(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">{connection.name}</DialogTitle>
        <DialogDescription className="mb-4 mt-1 text-xs text-muted-foreground">PostgreSQL · {connection.database}</DialogDescription>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">Schema<select className={connectionInput} value={schema} onChange={(e) => { setSchema(e.target.value); setSelected(null); }}>
            <option value="">All allowed schemas</option>
            {schemas.data?.items.map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(text.trim()); setSelected(null); }}>
            <label className="text-xs">Table name<input maxLength={63} value={text} onChange={(e) => setText(e.target.value)} className={connectionInput} /></label>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
          <Button type="button" variant="outline" className="ml-auto" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh Schema"}</Button>
        </div>
        {(refreshError || schemas.error || tables.error) && <p role="alert" className="mb-3 text-xs text-red-300">{refreshError || schemas.error?.message || tables.error?.message}</p>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ul aria-label="PostgreSQL tables" className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1.5 text-xs">
            {tables.isPending && <li className="p-2 text-muted-foreground">Loading tables…</li>}
            {tables.data?.items.map((table) => <li key={JSON.stringify([table.schema_name, table.name])}>
              <button type="button" aria-pressed={selected?.schema_name === table.schema_name && selected.name === table.name}
                aria-label={`${table.schema_name}.${table.name}`}
                className="w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-raised aria-pressed:bg-raised"
                onClick={() => { setSelected(table); setPreview(false); }}>
                <span className="text-muted-foreground">{table.schema_name}.</span>{table.name}
              </button>
            </li>)}
            {tables.data?.items.length === 0 && <li className="p-2 text-muted-foreground">No matching tables.</li>}
            {tables.data?.truncated && <li className="p-2 text-muted-foreground">Filter to see more tables.</li>}
          </ul>
          <div className="min-w-0 rounded-md border p-3">
            {!selected && <p className="text-xs text-muted-foreground">Select a table to inspect its columns.</p>}
            {selected && <h3 className="mb-2 break-all text-sm font-medium">{selected.schema_name}.{selected.name}</h3>}
            {selected && detail.isPending && <p role="status" className="text-xs text-muted-foreground">Loading table…</p>}
            {detail.error && <p role="alert" className="text-xs text-red-300">{detail.error.message}</p>}
            {detail.data && <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-raised"><tr>{["Column", "Type", "Nullable", "Primary key"].map((header) => <th className="whitespace-nowrap px-2 py-1.5 font-medium" scope="col" key={header}>{header}</th>)}</tr></thead>
                  <tbody>{detail.data.columns.map((column) => <tr key={column.name} className="border-b">
                    <th scope="row" className="px-2 py-1.5 font-normal">{column.name}</th>
                    <td className="whitespace-nowrap px-2 py-1.5">{column.data_type}</td>
                    <td className="px-2 py-1.5">{column.nullable ? "Yes" : "No"}</td>
                    <td className="px-2 py-1.5">{column.primary_key ? "Yes" : "No"}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              {connection.enable_previews && !preview && <Button className="mt-3" type="button" variant="outline" onClick={() => setPreview(true)}>Preview rows</Button>}
              {!connection.enable_previews && <p className="mt-3 text-xs text-muted-foreground">Table previews are disabled.</p>}
              {detail.data.preview && <div className="mt-3 overflow-x-auto">
                <table aria-label="Table preview" className="w-full text-left text-xs">
                  <thead className="bg-raised"><tr>{detail.data.preview.columns.map((name, index) => <th key={index} scope="col" className="px-2 py-1.5 font-medium">{name}</th>)}</tr></thead>
                  <tbody>{detail.data.preview.rows.map((row, index) => <tr className="border-b" key={index}>{row.map((value, column) => <td className="max-w-52 truncate px-2 py-1.5" key={column} title={cell(value)}>{cell(value)}</td>)}</tr>)}</tbody>
                </table>
                {detail.data.preview.rows.length === 0 && <p className="py-2 text-xs text-muted-foreground">No rows to display.</p>}
                {detail.data.preview.truncated && <p className="py-2 text-xs text-muted-foreground">Preview limited to a sample of rows.</p>}
              </div>}
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
