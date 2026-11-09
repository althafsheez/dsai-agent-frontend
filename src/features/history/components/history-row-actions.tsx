"use client";

import { useState } from "react";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { HistoryRecord } from "../types";

interface HistoryRowActionsProps {
  record: HistoryRecord;
  onRename: (name: string) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function HistoryRowActions({ record, onRename, onArchive, onDelete }: HistoryRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(record.name);
  const [pending, setPending] = useState(false);

  async function perform(action: () => Promise<void>, close: () => void) {
    setPending(true);
    try {
      await action();
      close();
      setMenuOpen(false);
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className="relative flex justify-end" onClick={(event) => event.stopPropagation()}>
      <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${record.name}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="size-7 opacity-60 group-hover:opacity-100 focus:opacity-100"><MoreHorizontal /></Button>
      {menuOpen && <div role="menu" className="absolute right-0 top-8 z-20 w-36 rounded-md border bg-[var(--surface-raised)] p-1 shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
        <ActionButton icon={Pencil} label="Rename" onClick={() => { setName(record.name); setRenameOpen(true); setMenuOpen(false); }} />
        <ActionButton icon={record.archived_at ? RotateCcw : Archive} label={record.archived_at ? "Restore" : "Archive"} onClick={() => void perform(() => onArchive(!record.archived_at), () => setMenuOpen(false))} />
        <ActionButton icon={Trash2} label="Delete" destructive onClick={() => { setDeleteOpen(true); setMenuOpen(false); }} />
      </div>}
    </div>

    <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
      <DialogContent className="max-w-sm p-5" onClick={(event) => event.stopPropagation()}>
        <DialogTitle className="text-sm font-medium">Rename {record.kind}</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">Choose a clear name for this {record.kind}.</DialogDescription>
        <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void perform(() => onRename(name), () => setRenameOpen(false)); }}>
          <input autoFocus aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-border-strong" />
          <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose><Button type="submit" disabled={pending || !name.trim()}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent className="max-w-sm p-5" onClick={(event) => event.stopPropagation()}>
        <DialogTitle className="text-sm font-medium">Delete {record.name}?</DialogTitle>
        <DialogDescription className="mt-2 text-xs leading-5 text-muted-foreground">This removes the {record.kind} from normal lists. Its data is preserved for recovery.</DialogDescription>
        <div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose><Button type="button" disabled={pending} onClick={() => void perform(onDelete, () => setDeleteOpen(false))} className="bg-[var(--destructive,oklch(0.65_0.17_25))] text-white">Delete</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

function ActionButton({ icon: Icon, label, destructive = false, onClick }: { icon: typeof Pencil; label: string; destructive?: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" onClick={onClick} className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-surface ${destructive ? "text-red-300" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-3.5" />{label}</button>;
}

