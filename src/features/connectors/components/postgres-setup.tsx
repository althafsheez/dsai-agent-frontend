"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  getWorkspaces, savePostgresConnection, testPostgresConnection,
  type PostgresConnection, type PostgresConnectionInput,
} from "@/lib/api";

export const connectionInput = "mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-xs focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring";

function ConnectionForm({ connection, workspaceId, owner, onSaved, onCancel }: {
  connection?: PostgresConnection;
  workspaceId?: string | null;
  owner: string;
  onSaved: (connection: PostgresConnection) => void;
  onCancel: () => void;
}) {
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const [fields, setFields] = useState({
    name: connection?.name ?? "",
    description: connection?.description ?? "",
    host: connection?.host ?? "",
    port: String(connection?.port ?? 5432),
    database: connection?.database ?? "",
    username: connection?.username ?? "",
    password: "",
    ssl_mode: connection?.ssl_mode ?? "verify-full",
    workspace_id: connection?.workspace_id ?? workspaceId ?? "",
    include_schema_for_ai: connection?.include_schema_for_ai ?? true,
    enable_previews: connection?.enable_previews ?? true,
    schemas: (connection?.schema_filter ?? ["public"]).join(", "),
  });
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<string[] | null>(null);

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setError("");
    if (["host", "port", "database", "username", "password", "ssl_mode"].includes(key)) setAvailable(null);
  }

  const selected = fields.schemas.split(",").map((value) => value.trim()).filter(Boolean);
  const { schemas: _schemas, password, ...metadata } = fields;
  const input: PostgresConnectionInput = {
    ...metadata, port: Number(fields.port), workspace_id: fields.workspace_id || null,
    schema_filter: selected, ...(password ? { password } : {}),
  };
  // The comma-separated field also lets users enter a permitted schema before running a test.
  void _schemas;

  async function run(action: "test" | "save") {
    if (pending || !form.current?.reportValidity()) return;
    setPending(action);
    setError("");
    try {
      if (action === "save") onSaved(await savePostgresConnection(input, connection?.id));
      else setAvailable((await testPostgresConnection(input, connection?.id)).schemas.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The PostgreSQL operation failed.");
    } finally {
      setPending(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("save");
  }

  return (
    <form ref={form} onSubmit={submit} className="space-y-4 text-xs">
      <fieldset disabled={Boolean(pending)} className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-semibold">General</legend>
        <label>Connection name<input className={connectionInput} required maxLength={120} value={fields.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>Description<input className={connectionInput} maxLength={2000} value={fields.description} onChange={(e) => set("description", e.target.value)} /></label>
      </fieldset>
      <fieldset disabled={Boolean(pending)} className="grid grid-cols-2 gap-3 border-t pt-3">
        <legend className="pr-2 text-sm font-semibold">Database</legend>
        <label>Host<input className={connectionInput} required maxLength={253} value={fields.host} onChange={(e) => set("host", e.target.value)} /></label>
        <label>Port<input className={connectionInput} required type="number" min={1} max={65535} value={fields.port} onChange={(e) => set("port", e.target.value)} /></label>
        <label>Database name<input className={connectionInput} required maxLength={63} value={fields.database} onChange={(e) => set("database", e.target.value)} /></label>
        <label>TLS<select className={connectionInput} value={fields.ssl_mode} onChange={(e) => set("ssl_mode", e.target.value as PostgresConnectionInput["ssl_mode"])}>
          <option value="verify-full">Verify certificate and hostname</option>
          {(process.env.NODE_ENV === "development" || fields.ssl_mode === "disable") && <option value="disable">Off for local testing</option>}
        </select></label>
      </fieldset>
      <fieldset disabled={Boolean(pending)} className="grid grid-cols-2 gap-3 border-t pt-3">
        <legend className="pr-2 text-sm font-semibold">Password authentication</legend>
        <label>Username<input className={connectionInput} required maxLength={63} autoComplete="off" value={fields.username} onChange={(e) => set("username", e.target.value)} /></label>
        <label>Password<input className={connectionInput} required={!connection} maxLength={1024} type="password" autoComplete="new-password" placeholder={connection ? "Keep saved password" : undefined} value={fields.password} onChange={(e) => set("password", e.target.value)} /></label>
      </fieldset>
      <fieldset disabled={Boolean(pending)} className="space-y-2.5 border-t pt-3">
        <legend className="pr-2 text-sm font-semibold">Data access</legend>
        <p className="text-muted-foreground">Owner {owner} · Read-only</p>
        <label className="block">Workspace<select className={connectionInput} value={fields.workspace_id} onChange={(e) => set("workspace_id", e.target.value)}>
          <option value="">Personal connection</option>
          {workspaces.data?.items.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select></label>
        <label className="block">Allowed schemas<input className={connectionInput} required maxLength={2200} value={fields.schemas} onChange={(e) => set("schemas", e.target.value)} placeholder="public, analytics" /></label>
        {available && <div role="status" className="space-y-2 rounded-md border p-2.5">
          <p className="text-sage">Connected to PostgreSQL</p>
          {available.length ? <div className="flex flex-wrap gap-x-3 gap-y-2">
            {available.map((schema) => <label key={schema} className="flex items-center gap-1.5">
              <input type="checkbox" checked={selected.includes(schema)} onChange={(e) => set("schemas", (e.target.checked ? [...selected, schema] : selected.filter((item) => item !== schema)).join(", "))} />{schema}
            </label>)}
          </div> : <p className="text-muted-foreground">This role cannot read any supported tables.</p>}
        </div>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={fields.include_schema_for_ai} onChange={(e) => set("include_schema_for_ai", e.target.checked)} />Include schema and query data for AI</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={fields.enable_previews} onChange={(e) => set("enable_previews", e.target.checked)} />Enable table previews</label>
      </fieldset>
      {error && <p role="alert" className="rounded-md border border-red-500/30 p-2.5 text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => void run("test")}>{pending === "test" ? "Testing…" : "Test Connection"}</Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={Boolean(pending)}>{pending === "save" ? "Saving…" : "Save Connection"}</Button>
        </div>
      </div>
    </form>
  );
}

export function PostgresSetup({ open, connection, workspaceId, onClose, onSaved }: {
  open: boolean;
  connection?: PostgresConnection;
  workspaceId?: string | null;
  onClose: () => void;
  onSaved?: (connection: PostgresConnection) => void;
}) {
  const queryClient = useQueryClient();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">{connection ? "Edit PostgreSQL connection" : "Add PostgreSQL connection"}</DialogTitle>
        <DialogDescription className="mb-4 mt-1 text-xs text-muted-foreground">Connect a PostgreSQL database using a dedicated read-only role.</DialogDescription>
        <ConnectionForm key={connection?.id ?? "new"} connection={connection} workspaceId={workspaceId} owner={connection?.owner ?? "You"}
          onCancel={onClose} onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: ["postgres-connections"] });
            void queryClient.invalidateQueries({ queryKey: ["postgres-schema", saved.id] });
            onSaved?.(saved);
            onClose();
          }} />
      </DialogContent>
    </Dialog>
  );
}
