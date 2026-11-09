"use client";

import { MessageSquare, Folder } from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "../logic/filter-history";
import type { HistoryRecord } from "../types";
import { HistoryRowActions } from "./history-row-actions";

interface HistoryTableProps {
  records: HistoryRecord[];
  loading: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
  onRename: (record: HistoryRecord, name: string) => Promise<void>;
  onArchive: (record: HistoryRecord, archived: boolean) => Promise<void>;
  onDelete: (record: HistoryRecord) => Promise<void>;
}

export function HistoryTable({ records, loading, hasFilters, onClearFilters, onRename, onArchive, onDelete }: HistoryTableProps) {
  if (loading) return <div aria-label="Loading history" className="mt-6 overflow-hidden rounded-md border">
    {[0, 1, 2, 3].map((row) => <div key={row} className="flex h-12 items-center gap-4 border-b px-3 last:border-0"><span className="h-3 w-1/3 animate-pulse rounded bg-raised" /><span className="h-3 w-1/5 animate-pulse rounded bg-raised" /></div>)}
  </div>;

  if (records.length === 0) return <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
    <p className="text-sm font-medium">{hasFilters ? "No matching history" : "No history yet"}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hasFilters ? "Try adjusting your search or filters." : "Chats and workspaces will appear here after you create them."}</p>
    {hasFilters && <button type="button" onClick={onClearFilters} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button>}
  </div>;

  return <div className="mt-6 overflow-x-auto rounded-md border">
    <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
      <thead className="bg-surface text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <tr><th className="w-[39%] px-3 py-2 font-medium">Name</th><th className="w-[25%] px-3 py-2 font-medium">Workspace</th><th className="w-[18%] px-3 py-2 font-medium">Author</th><th className="w-[13%] px-3 py-2 font-medium">Updated</th><th className="w-10 px-2"><span className="sr-only">Actions</span></th></tr>
      </thead>
      <tbody>
        {records.map((record) => {
          const href = record.kind === "chat" ? `/chat/${record.id}` : `/workspaces/${record.id}`;
          const Icon = record.kind === "chat" ? MessageSquare : Folder;
          return <tr key={`${record.kind}-${record.id}`} className="group border-t text-xs transition-colors hover:bg-surface">
            <td className="p-0"><Link href={href} className="flex min-w-0 items-center gap-2.5 px-3 py-3 font-medium text-foreground outline-none focus-visible:bg-raised"><Icon className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{record.name}</span></Link></td>
            <td className="truncate px-3 py-3 text-muted-foreground">{record.kind === "workspace" ? "—" : record.workspace_name ?? "Standalone"}</td>
            <td className="truncate px-3 py-3 text-muted-foreground">{record.author.name}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><time dateTime={record.updated_at}>{formatRelativeTime(record.updated_at)}</time></td>
            <td className="px-2 py-1"><HistoryRowActions record={record} onRename={(name) => onRename(record, name)} onArchive={(archived) => onArchive(record, archived)} onDelete={() => onDelete(record)} /></td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

