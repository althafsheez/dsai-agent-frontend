"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, Mail, MailOpen, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { HistoryRecord } from "../types";

interface HistoryRowActionsProps {
  record: HistoryRecord;
  onRename: (name: string) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onUnreadChange: (isUnread: boolean) => Promise<void>;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

export function HistoryRowActions({ record, onRename, onArchive, onDelete, onUnreadChange, menuOpen, onMenuOpenChange }: HistoryRowActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(record.name);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!menuOpen) return;

    const positionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 144;
      const menuHeight = record.kind === "chat" ? 140 : 108;
      const gap = 4;
      const viewportPadding = 8;
      const opensAbove = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding;
      setMenuPosition({
        top: opensAbove ? Math.max(viewportPadding, rect.top - menuHeight - gap) : rect.bottom + gap,
        left: Math.min(window.innerWidth - menuWidth - viewportPadding, Math.max(viewportPadding, rect.right - menuWidth)),
      });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [menuOpen, record.kind]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) onMenuOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMenuOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, onMenuOpenChange]);

  async function perform(action: () => Promise<void>, close: () => void) {
    setPending(true);
    try {
      await action();
      close();
      onMenuOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className="relative flex justify-end" onClick={(event) => event.stopPropagation()}>
      <Button ref={triggerRef} type="button" variant="ghost" size="icon" aria-label={`Actions for ${record.name}`} aria-haspopup="menu" aria-controls={menuOpen ? menuId : undefined} aria-expanded={menuOpen} onClick={() => onMenuOpenChange(!menuOpen)} className="size-7 opacity-60 group-hover:opacity-100 focus:opacity-100"><MoreHorizontal /></Button>
      {menuOpen && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label={`Actions for ${record.name}`} className="fixed z-[60] w-36 rounded-md border bg-[var(--surface-raised)] p-1 shadow-xl" style={menuPosition}>
        <ActionButton icon={Pencil} label="Rename" onClick={() => { setName(record.name); setRenameOpen(true); onMenuOpenChange(false); }} />
        {record.kind === "chat" && <ActionButton icon={record.is_unread ? MailOpen : Mail} label={record.is_unread ? "Mark as Read" : "Mark as Unread"} onClick={() => void perform(() => onUnreadChange(!record.is_unread), () => onMenuOpenChange(false))} />}
        <ActionButton icon={record.archived_at ? RotateCcw : Archive} label={record.archived_at ? "Restore" : "Archive"} onClick={() => void perform(() => onArchive(!record.archived_at), () => onMenuOpenChange(false))} />
        <ActionButton icon={Trash2} label="Delete" destructive onClick={() => { setDeleteOpen(true); onMenuOpenChange(false); }} />
      </div>, document.body)}
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
