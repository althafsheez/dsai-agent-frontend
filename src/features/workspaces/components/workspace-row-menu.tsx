"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Copy, ExternalLink, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import type { WorkspaceDto } from "@/lib/api";

const MENU_WIDTH = 168;
const MENU_HEIGHT = 156;
const GAP = 4;
const VIEWPORT_PADDING = 8;

interface WorkspaceRowMenuProps {
  workspace: WorkspaceDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copied: boolean;
  onCopyLink: () => void;
  onPinChange: (pinned: boolean) => void;
  onDelete: () => void;
  deleting: boolean;
}

// Rendered in a portal with fixed positioning: the table sits in an overflow-x container that clipped an absolute menu.
export function WorkspaceRowMenu({ workspace, open, onOpenChange, copied, onCopyLink, onPinChange, onDelete, deleting }: WorkspaceRowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const opensAbove = rect.bottom + GAP + MENU_HEIGHT > window.innerHeight - VIEWPORT_PADDING;
      setPosition({
        top: opensAbove ? Math.max(VIEWPORT_PADDING, rect.top - MENU_HEIGHT - GAP) : rect.bottom + GAP,
        left: Math.min(window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, rect.right - MENU_WIDTH)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const itemClass = "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-muted-foreground hover:bg-surface hover:text-foreground";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${workspace.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${workspace.name}`}
          style={{ ...position, width: MENU_WIDTH }}
          className="fixed z-[60] rounded-md border bg-[var(--surface-raised)] p-1 text-xs shadow-xl"
        >
          <Link role="menuitem" href={`/workspaces/${workspace.id}`} onClick={() => onOpenChange(false)} className={itemClass}>
            <ExternalLink className="size-3.5" />Open
          </Link>
          <button role="menuitem" type="button" onClick={() => { onPinChange(!workspace.pinned_at); onOpenChange(false); }} className={itemClass}>
            {workspace.pinned_at ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {workspace.pinned_at ? "Unpin workspace" : "Pin workspace"}
          </button>
          <button role="menuitem" type="button" onClick={onCopyLink} className={itemClass}>
            {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <div className="my-1 border-t" />
          <button
            role="menuitem"
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-red-300 hover:bg-red-400/10"
          >
            <Trash2 className="size-3.5" />Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
