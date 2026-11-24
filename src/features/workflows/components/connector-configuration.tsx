"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectorPreviews } from "@/features/connectors/catalog";
import { ExtensionIcon } from "@/features/connectors/components/extension-icon";
import { PostgresSetup } from "@/features/connectors/components/postgres-setup";
import { getConnectors, getPostgresConnections } from "@/lib/api";
import { cn } from "@/lib/utils";
import { appliedAction } from "../logic/steps";
import { PostgresActionEditor } from "./postgres-action-editor";

const tabs = [
  { id: "mine", name: "My Connections" },
  { id: "database", name: "Databases" },
  { id: "app", name: "Apps & Tools" },
  { id: "skill", name: "Skills" },
] as const;

type Connection = { provider: "postgresql" | "google-drive"; id: string; name: string };

const postgres = connectorPreviews.find((entry) => entry.id === "postgresql")!;
const driveExtension = connectorPreviews.find((entry) => entry.id === "google-drive")!;

export function ConnectorConfiguration({ config, instructions, onChange, onInstructionsChange }: {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("mine");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string>();
  const [browsing, setBrowsing] = useState(false);
  const [setup, setSetup] = useState(false);
  const postgresQuery = useQuery({ queryKey: ["postgres-connections"], queryFn: () => getPostgresConnections(), retry: false });
  const driveQuery = useQuery({ queryKey: ["connectors"], queryFn: getConnectors, retry: false });
  const drive = driveQuery.data?.items.find((item) => item.id === "google-drive");
  const driveConnection: Connection | undefined = drive?.status === "connected"
    ? { provider: "google-drive", id: "google-drive", name: drive.account_email || "Google Drive" }
    : undefined;
  const entry = connectorPreviews.find((item) => item.id === selection);
  const query = search.trim().toLowerCase();
  const matches = (...values: string[]) => values.some((value) => value.toLowerCase().includes(query));
  const postgresConnections = (postgresQuery.data?.items ?? []).filter((item) => matches(item.name, item.database, "PostgreSQL"));
  const entries = connectorPreviews.filter((item) => item.category === tab && matches(item.name, item.description));
  const showDrive = driveConnection && matches(driveConnection.name, "Google Drive");
  const attachedName = typeof config.connection_name === "string" ? config.connection_name : undefined;

  function attach({ provider, id, name }: Connection) {
    onChange({ connection_provider: provider, connection_id: id, connection_name: name, action: undefined });
    setBrowsing(false);
    setSelection(undefined);
  }

  function connectionRow({ provider, id, name }: Connection, description: string, available = true) {
    const added = config.connection_id === id && config.connection_provider === provider;
    return (
      <li key={id} className="flex min-w-0 items-center gap-2 px-2 py-2">
        <ExtensionIcon compact extension={provider === "postgresql" ? postgres : driveExtension} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium" title={name}>{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{description}</span>
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2" disabled={!available || added}
          aria-label={added ? `${name} selected` : `Select ${name}`} onClick={() => attach({ provider, id, name })}>
          {added ? "Selected" : "Select"}
        </Button>
      </li>
    );
  }

  if (attachedName && !browsing) {
    const extension = config.connection_provider === "postgresql" ? postgres : driveExtension;
    return (
      <div className="grid min-w-0 gap-3">
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <ExtensionIcon compact extension={extension} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" title={attachedName}>{attachedName}</p>
            <p className="text-[11px] text-muted-foreground">{extension.name}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="shrink-0 px-2" onClick={() => {
            setTab("mine");
            setSearch("");
            setBrowsing(true);
          }}>Change</Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Remove saved connection"
            onClick={() => onChange({ connection_id: undefined, connection_name: undefined, connection_provider: undefined, action: undefined })}><Trash2 /></Button>
        </div>
        {config.connection_provider === "postgresql" && typeof config.connection_id === "string" ? (
          <PostgresActionEditor key={config.connection_id} connectionId={config.connection_id} instructions={instructions}
            applied={appliedAction(config, instructions)} onInstructionsChange={onInstructionsChange} onApply={(action) => onChange({ action })} />
        ) : <div className="space-y-2 rounded-lg border p-3">
          <h3 className="text-xs font-semibold">Action</h3>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Action instructions</span>
            <textarea value={instructions} maxLength={2000} rows={6}
              placeholder="Describe what to do with this connection…"
              onChange={(event) => onInstructionsChange(event.target.value)}
              className="block w-full resize-y rounded-md border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground" />
          </label>
          <p className="text-[11px] text-muted-foreground">Draft only. Workflow actions for this extension are unavailable.</p>
        </div>}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {attachedName && <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => {
        setSelection(undefined);
        setBrowsing(false);
      }}><ArrowLeft /> Back to action</Button>}
      {entry ? (
        <div className="space-y-3 rounded-lg border p-3">
          <Button type="button" size="sm" variant="ghost" className="-ml-2" onClick={() => setSelection(undefined)}><ArrowLeft /> Browse sources</Button>
          <div className="flex items-start gap-2">
            <ExtensionIcon compact extension={entry} />
            <div>
              <p className="text-xs font-medium">{entry.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
            </div>
          </div>
          {selection === "postgresql" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setSetup(true)}>Configure</Button>
          ) : selection === "google-drive" && drive?.configured && !driveConnection ? (
            <Button asChild variant="outline" size="sm"><Link href="/extensions" target="_blank" rel="noopener noreferrer">Configure in Extensions</Link></Button>
          ) : selection === "google-drive" && driveConnection ? (
            <Button type="button" size="sm" variant="outline" onClick={() => attach(driveConnection)}>Configure</Button>
          ) : <>
            <Button type="button" size="sm" variant="outline" disabled>Configure</Button>
            <p className="text-xs text-muted-foreground">{selection === "google-drive" ? "Google Drive is unavailable." : "Coming soon"}</p>
          </>}
        </div>
      ) : <>
        <div role="group" aria-label="Extension category" className="grid grid-cols-2 gap-1 rounded-lg border bg-raised p-1">
          {tabs.map(({ id, name }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setSearch(""); }}
            className={cn("rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground", tab === id && "bg-surface font-medium text-foreground")}>{name}</button>)}
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <input aria-label="Search sources" type="search" placeholder="Search sources…" value={search} onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs" />
        </label>
        {tab === "mine" ? <>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => {
            setTab("database");
            setSearch("");
          }}><Plus /> Add new connection</Button>
          {postgresConnections.length > 0 || showDrive ? <ul className="divide-y rounded-md border">
            {postgresConnections.map((item) => {
              const unavailable = item.workspace_id ? "Workspace connection" : item.include_schema_for_ai === false ? "AI schema access is off" :
                item.enable_previews === false ? "Row previews are off" : item.status !== "connected" ? "Connection needs attention" : "";
              return connectionRow({ provider: "postgresql", id: item.id, name: item.name }, unavailable || item.database, !unavailable);
            })}
            {showDrive && connectionRow(driveConnection, "Google Drive")}
          </ul> : <p className="text-xs text-muted-foreground">{postgresQuery.isLoading || driveQuery.isLoading ? "Loading saved connections…" : "No saved connections found."}</p>}
          {(postgresQuery.isError || driveQuery.isError) && <p className="text-xs text-muted-foreground">Some connections could not be loaded.</p>}
        </> : (
          <ul className="divide-y rounded-md border">
            {entries.map((item) => <li key={item.id}>
              <button type="button" onClick={() => setSelection(item.id)} className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs hover:bg-raised">
                <ExtensionIcon compact extension={item} /><span className="min-w-0 flex-1 truncate">{item.name}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>)}
            {!entries.length && <li className="p-2 text-xs text-muted-foreground">No matching sources.</li>}
          </ul>
        )}
      </>}
      {setup && <PostgresSetup open onClose={() => setSetup(false)} onSaved={(saved) => {
        setTab("mine");
        setSelection(undefined);
        if (!saved.workspace_id && saved.include_schema_for_ai && saved.enable_previews) {
          attach({ provider: "postgresql", id: saved.id, name: saved.name });
        }
      }} />}
    </div>
  );
}
