"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Folder, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  onDeleteMany?: (records: HistoryRecord[]) => Promise<void>;
}

function recordKey(record: HistoryRecord) {
  return `${record.kind}:${record.id}`;
}

export function HistoryTable({ records, loading, hasFilters, onClearFilters, onRename, onArchive, onDelete, onDeleteMany }: HistoryTableProps) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visibleKeys = useMemo(() => new Set(records.map(recordKey)), [records]);
  const selectedRecords = useMemo(() => records.filter((record) => selectedKeys.has(recordKey(record))), [records, selectedKeys]);
  const allSelected = records.length > 0 && selectedRecords.length === records.length;

  useEffect(() => {
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => visibleKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [visibleKeys]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedRecords.length > 0 && !allSelected;
  }, [allSelected, selectedRecords.length]);

  function toggleSelected(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function deleteSelected() {
    setBulkDeletePending(true);
    try {
      if (onDeleteMany) await onDeleteMany(selectedRecords);
      else await Promise.all(selectedRecords.map(onDelete));
      setSelectedKeys(new Set());
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeletePending(false);
    }
  }

  if (loading) return <div aria-label="Loading history" className="mt-6 overflow-hidden rounded-md border">
    {[0, 1, 2, 3].map((row) => <div key={row} className="flex h-12 items-center gap-4 border-b px-3 last:border-0"><span className="h-3 w-1/3 animate-pulse rounded bg-raised" /><span className="h-3 w-1/5 animate-pulse rounded bg-raised" /></div>)}
  </div>;

  if (records.length === 0) return <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
    <p className="text-sm font-medium">{hasFilters ? "No matching history" : "No history yet"}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hasFilters ? "Try adjusting your search or filters." : "Chats and workspaces will appear here after you create them."}</p>
    {hasFilters && <button type="button" onClick={onClearFilters} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button>}
  </div>;

  return <div className="mt-6">
    {selectedRecords.length > 0 && <div className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded-md border bg-surface px-3 py-1.5" role="toolbar" aria-label="Selected history actions">
      <span className="text-xs font-medium">{selectedRecords.length} selected</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setBulkDeleteOpen(true)} className="text-red-300 hover:text-red-200"><Trash2 />Delete selected</Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelectedKeys(new Set())} className="size-7"><X /></Button>
      </div>
    </div>}
    <div className="overflow-x-auto rounded-md border">
    <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
      <thead className="bg-surface text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <tr><th className="w-10 px-3 py-2"><input ref={selectAllRef} type="checkbox" aria-label="Select all history" checked={allSelected} onChange={() => setSelectedKeys(allSelected ? new Set() : new Set(records.map(recordKey)))} className="size-3.5 accent-[var(--primary)]" /></th><th className="w-[37%] px-1 py-2 font-medium">Name</th><th className="w-[24%] px-3 py-2 font-medium">Workspace</th><th className="w-[18%] px-3 py-2 font-medium">Author</th><th className="w-[13%] px-3 py-2 font-medium">Updated</th><th className="w-10 px-2"><span className="sr-only">Actions</span></th></tr>
      </thead>
      <tbody>
        {records.map((record) => {
          const key = recordKey(record);
          const href = record.kind === "chat" ? `/chat/${record.id}` : `/workspaces/${record.id}`;
          const Icon = record.kind === "chat" ? MessageSquare : Folder;
          return <tr key={key} className={`group border-t text-xs transition-colors hover:bg-surface ${selectedKeys.has(key) ? "bg-surface" : ""}`}>
            <td className="px-3 py-1"><input type="checkbox" aria-label={`Select ${record.name}`} checked={selectedKeys.has(key)} onChange={() => toggleSelected(key)} className="size-3.5 accent-[var(--primary)]" /></td>
            <td className="p-0"><Link href={href} className="flex min-w-0 items-center gap-2.5 px-1 py-3 font-medium text-foreground outline-none focus-visible:bg-raised"><Icon className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{record.name}</span></Link></td>
            <td className="truncate px-3 py-3 text-muted-foreground">{record.kind === "workspace" ? "—" : record.workspace_name ?? "Standalone"}</td>
            <td className="truncate px-3 py-3 text-muted-foreground">{record.author.name}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><time dateTime={record.updated_at}>{formatRelativeTime(record.updated_at)}</time></td>
            <td className="px-2 py-1"><HistoryRowActions record={record} menuOpen={openMenuKey === key} onMenuOpenChange={(open) => setOpenMenuKey(open ? key : null)} onRename={(name) => onRename(record, name)} onArchive={(archived) => onArchive(record, archived)} onDelete={() => onDelete(record)} /></td>
          </tr>;
        })}
      </tbody>
    </table>
    </div>
    <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
      <DialogContent className="max-w-sm p-5">
        <DialogTitle className="text-sm font-medium">Delete {selectedRecords.length} selected {selectedRecords.length === 1 ? "item" : "items"}?</DialogTitle>
        <DialogDescription className="mt-2 text-xs leading-5 text-muted-foreground">The selected chats and workspaces will be removed from normal lists. Their data is preserved for recovery.</DialogDescription>
        <div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose><Button type="button" disabled={bulkDeletePending} onClick={() => void deleteSelected()} className="bg-[var(--destructive,oklch(0.65_0.17_25))] text-white">Delete selected</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
