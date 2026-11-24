"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, ChevronRight, Database, LoaderCircle, Paperclip, Plus, Search, Table2 } from "lucide-react";
import { getPostgresConnections, getPostgresTables, importPostgresTable, uploadResource } from "@/lib/api";
import type { PostgresConnection } from "@/lib/api/types";
import { CONNECTOR_ITEMS } from "@/features/connectors/attach-catalog";
import { PostgresSetup } from "@/features/connectors/components/postgres-setup";

type Category = "connections" | "databases" | "data" | "apps";
const CATEGORIES: Array<[Category, string]> = [["connections", "My Connections"], ["databases", "Databases"], ["data", "Data Sources"], ["apps", "Apps & Tools"]];
const DATABASES = new Set(["Google BigQuery", "Snowflake", "MySQL"]);
const card = "flex min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-gradient-to-br from-[#29323e] to-[#20272f] p-2 text-left hover:border-slate/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring";
const row = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-raised";

/** "Add dataset": files from the device, the Library, saved connections (Google Drive, PostgreSQL tables) and databases. */
export function AddDatasetMenu({ onUploaded, onDrive, onLibrary }: { onUploaded: () => void; onDrive: () => void; onLibrary?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("connections");
  const [browsing, setBrowsing] = useState<PostgresConnection | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (files: File[]) => { for (const file of files) await uploadResource({ file, scopeType: "library", scopeId: "library", clientUploadId: crypto.randomUUID() }); },
    onSuccess: onUploaded,
  });
  const connections = useQuery({ queryKey: ["postgres-connections"], queryFn: () => getPostgresConnections(), enabled: open, retry: false, staleTime: 30_000 });
  const search = query.trim().toLowerCase();
  const tables = useQuery({
    queryKey: ["postgres-tables", browsing?.id, search],
    queryFn: () => getPostgresTables(browsing?.id ?? "", "", search),
    enabled: Boolean(browsing), retry: 1, staleTime: 30_000,
  });
  const importing = useMutation({
    mutationFn: (table: { schema_name: string; name: string }) => importPostgresTable(browsing?.id ?? "", table.schema_name, table.name),
    onSuccess: () => { onUploaded(); close(); },
  });
  const saved = (connections.data?.items ?? []).filter((item) => `${item.name} ${item.database}`.toLowerCase().includes(search));
  const showDrive = category === "connections" && "google drive".includes(search);
  const soon = CONNECTOR_ITEMS.filter((item) => item.category !== "skills" && (category === "databases" ? DATABASES.has(item.name) : category === item.category && !DATABASES.has(item.name)))
    .filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search));
  const close = () => { setOpen(false); setBrowsing(null); setQuery(""); };

  const connectionRow = (connection: PostgresConnection) => (
    <button key={connection.id} type="button" onClick={() => { setBrowsing(connection); setQuery(""); }} className={row}>
      <Image src="/extension-logos/postgresql.svg" alt="" width={20} height={20} unoptimized />
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{connection.name}</span><span className="block truncate text-[11px] text-muted-foreground">PostgreSQL · {connection.database}</span></span>
      <span className="shrink-0 text-[11px] text-muted-foreground">Pick a table</span><ChevronRight className="size-3.5 shrink-0" />
    </button>
  );

  return (
    <div className="relative shrink-0" onBlur={(event) => { if (!setupOpen && !event.currentTarget.contains(event.relatedTarget)) close(); }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} disabled={upload.isPending} onClick={() => (open ? close() : setOpen(true))} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs font-medium transition-colors hover:border-border-strong disabled:opacity-60">
        <Plus className="size-3.5" />{upload.isPending ? "Uploading…" : "Add dataset"}
      </button>
      <input ref={input} type="file" multiple accept=".csv,.tsv,.xlsx,.xls,.parquet" className="sr-only" tabIndex={-1} aria-label="Choose dataset files" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) upload.mutate(files); event.currentTarget.value = ""; }} />
      {open ? (
        <div role="dialog" aria-label="Add a dataset" onMouseDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}
          className="absolute right-0 top-full z-30 mt-2 flex h-[min(28rem,70dvh)] w-[min(22rem,calc(100vw-2rem))] animate-pop-in flex-col overflow-hidden rounded-xl border border-border-strong bg-[#191b1e] shadow-2xl">
          <div className="shrink-0 space-y-2 px-2.5 pt-2.5">
            {browsing ? (
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Back" onClick={() => { setBrowsing(null); setQuery(""); }} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><ArrowLeft className="size-4" /></button>
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{browsing.name} <span className="font-normal text-muted-foreground">· pick a table</span></p>
              </div>
            ) : null}
            <label className="relative block">
              <span className="sr-only">{browsing ? "Find a table" : "Find a connection or source"}</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={browsing ? "Find a table…" : "Find a connection or source…"} className="h-9 w-full rounded-lg border border-border-strong bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring" />
            </label>
            {browsing ? null : (
              <>
                <div className={onLibrary ? "grid grid-cols-2 gap-2" : "grid grid-cols-1"}>
                  <button type="button" onClick={() => { close(); input.current?.click(); }} className={card}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#b8cef0] text-[#172033]"><Paperclip aria-hidden="true" className="size-4" /></span>
                    <span className="min-w-0"><span className="block text-xs font-semibold leading-4">Add files</span><span className="block text-[10px] leading-4 text-muted-foreground">From your device</span></span>
                    <ChevronRight aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
                  </button>
                  {onLibrary ? (
                    <button type="button" onClick={() => { close(); onLibrary(); }} className={card}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#c2d9b8] text-[#172e18]"><BookOpen aria-hidden="true" className="size-4" /></span>
                      <span className="min-w-0"><span className="block text-xs font-semibold leading-4">From Library</span><span className="block text-[10px] leading-4 text-muted-foreground">Saved datasets</span></span>
                      <ChevronRight aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
                    </button>
                  ) : null}
                </div>
                <div role="tablist" aria-label="Sources" className="flex flex-wrap gap-1 border-b pb-1.5">
                  {CATEGORIES.map(([value, label]) => (
                    <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => setCategory(value)} className={`h-8 rounded-md px-2 text-[11px] ${category === value ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-1">
            {browsing ? (
              tables.isPending ? <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading tables…</p>
                : tables.isError ? <p role="alert" className="px-3 py-4 text-xs text-red-300">Could not read the tables. Check the connection in Extensions.</p>
                  : (tables.data?.items ?? []).length ? (
                    <ul aria-label="Tables">
                      {(tables.data?.items ?? []).map((table) => (
                        <li key={`${table.schema_name}.${table.name}`}>
                          <button type="button" disabled={importing.isPending} onClick={() => importing.mutate(table)} className={row}>
                            <Table2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{table.schema_name === "public" ? table.name : `${table.schema_name}.${table.name}`}</span>
                            {importing.isPending && importing.variables?.name === table.name ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="text-[11px] text-muted-foreground">Add</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-3 py-4 text-xs text-muted-foreground">No tables found.</p>
            ) : (
              <>
                {showDrive ? (
                  <button type="button" onClick={() => { close(); onDrive(); }} className={row}>
                    <Image src="/extension-logos/googledrive.svg" alt="" width={20} height={20} unoptimized /> Google Drive <span className="ml-auto text-muted-foreground">Import files</span>
                  </button>
                ) : null}
                {category === "connections" || category === "databases" ? saved.map(connectionRow) : null}
                {category === "databases" ? (
                  <button type="button" onClick={() => setSetupOpen(true)} className={row}>
                    <Database className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block font-medium">Connect PostgreSQL</span><span className="block text-[11px] text-muted-foreground">Add a database connection (read-only)</span></span>
                    <Plus className="size-3.5 shrink-0" />
                  </button>
                ) : null}
                {category === "connections" && connections.isPending ? <p className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Loading connections…</p> : null}
                {soon.map(({ name, description, icon: Icon, logo }) => (
                  <div key={name} aria-disabled="true" className="flex items-center gap-3 border-b px-2 py-2 last:border-b-0">
                    {logo ? <Image src={`/extension-logos/${logo}.svg`} alt="" width={20} height={20} unoptimized className="shrink-0" /> : <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{name}</span><span className="block truncate text-[11px] text-muted-foreground">{description}</span></span>
                    <span className="shrink-0 rounded-full border bg-raised px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Soon</span>
                  </div>
                ))}
                {category === "connections" && !showDrive && !saved.length && !connections.isPending ? <p className="px-3 py-4 text-xs text-muted-foreground">No connections yet. Add a database under Databases.</p> : null}
              </>
            )}
            {importing.isError ? <p role="alert" className="px-3 py-2 text-xs text-red-300">{importing.error instanceof Error ? importing.error.message : "Could not add the table."}</p> : null}
          </div>
          <div className="shrink-0 border-t px-2.5 py-2 text-[10px]">
            <button type="button" onClick={() => { close(); router.push("/extensions"); }} className="rounded-md px-1 py-1 text-muted-foreground hover:text-foreground">Manage connections in Extensions</button>
          </div>
        </div>
      ) : null}
      <PostgresSetup open={setupOpen} onClose={() => setSetupOpen(false)} onSaved={(connection) => { setSetupOpen(false); void connections.refetch(); setOpen(true); setBrowsing(connection); }} />
    </div>
  );
}
