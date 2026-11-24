"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, Plus, X } from "lucide-react";
import { getPostgresConnections, type PostgresConnection } from "@/lib/api";

export function PostgresSources({ chatId, workspaceId, selected, onSelect, onAdd }: {
  chatId?: string;
  workspaceId?: string | null;
  selected: PostgresConnection[];
  onSelect: (connection: PostgresConnection) => void;
  onAdd: () => void;
}) {
  const connections = useQuery({
    queryKey: ["postgres-connections", "analysis", chatId, workspaceId],
    queryFn: () => getPostgresConnections({ chatId, workspaceId }),
    retry: false,
  });
  return (
    <section aria-label="PostgreSQL connections" className="space-y-1 border-b p-2">
      <p className="px-1 text-xs font-medium">PostgreSQL</p>
      {connections.isPending && <p role="status" className="px-1 text-xs text-muted-foreground">Loading connections…</p>}
      {connections.error && <p role="alert" className="px-1 text-xs text-red-300">{connections.error.message}</p>}
      {connections.data?.items.map((connection) => {
        const picked = selected.some((item) => item.id === connection.id);
        return <button key={connection.id} type="button" data-attachment-action aria-pressed={picked}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-raised aria-pressed:bg-raised"
          onClick={() => onSelect(connection)}>
          <Database className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{connection.name}</span>
          <span className="text-muted-foreground">{picked ? "Selected" : connection.status === "failed" ? "Connection failed" : connection.database}</span>
        </button>;
      })}
      <button type="button" data-attachment-action onClick={onAdd} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-raised">
        <Plus className="size-4 text-muted-foreground" aria-hidden="true" />Add PostgreSQL Connection
      </button>
    </section>
  );
}

export function PostgresChips({ connections, onRemove }: {
  connections: PostgresConnection[];
  onRemove: (id: string) => void;
}) {
  if (!connections.length) return null;
  return <div aria-label="Selected databases" className="mb-2 flex flex-wrap gap-1.5">
    {connections.map((connection) => <span key={connection.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-raised px-2 py-1 text-xs">
      <Database className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{connection.name}</span>
      <button type="button" className="shrink-0 rounded p-0.5 hover:bg-surface" aria-label={`Remove database ${connection.name}`} onClick={() => onRemove(connection.id)}><X className="size-3.5" aria-hidden="true" /></button>
    </span>)}
  </div>;
}
