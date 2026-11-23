"use client";

import { CirclePause, GripVertical, LoaderCircle, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import type { MessageDto } from "@/lib/api";

export interface QueuedQuestion {
  runId: string;
  message: MessageDto;
  removing: boolean;
  paused: boolean;
}

interface Props {
  items: QueuedQuestion[];
  editingId?: string;
  busy: boolean;
  onMove: (from: string, to: string) => void;
  onEdit: (item: QueuedQuestion) => void;
  onRemove: (runId: string) => void;
  onResume: () => void;
}

export function QueuedQuestions({ items, editingId, busy, onMove, onEdit, onRemove, onResume }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const dragPointer = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function rowAtPointer(event: PointerEvent<HTMLButtonElement>) {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-queued-run]");
    return row && list.current?.contains(row) ? row.dataset.queuedRun : undefined;
  }

  function clearDrag() {
    dragPointer.current = null;
    setDropTarget(null);
  }

  if (!items.length) return null;

  return (
    <ol ref={list} aria-label="Queued questions" className="mx-auto mb-2 max-w-3xl space-y-1.5">
      {items.map((item, index) => {
        const editing = item.runId === editingId;
        const names = item.message.attachment_refs.map((file) => file.name ?? "Attached file");
        return (
          <li
            key={item.runId}
            data-queued-run={item.runId}
            className={`flex items-center gap-2 rounded-md border bg-raised py-1 pl-1 pr-2 text-xs ${dropTarget === item.runId || editing ? "border-ring" : "border-border"}`}
          >
            <button
              type="button"
              aria-label={`Reorder queued question: ${item.message.content}`}
              aria-keyshortcuts="ArrowUp ArrowDown"
              title="Drag or use the arrow keys to reorder"
              disabled={items.length < 2}
              aria-disabled={busy || items.length < 2}
              className="grid size-7 shrink-0 touch-none cursor-grab place-items-center rounded text-muted-foreground hover:bg-surface hover:text-foreground active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40"
              onPointerDown={(event) => {
                if (busy || event.button !== 0 || !event.isPrimary) return;
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragPointer.current = event.pointerId;
              }}
              onPointerMove={(event) => {
                if (dragPointer.current !== event.pointerId) return;
                const target = rowAtPointer(event);
                setDropTarget(target && target !== item.runId ? target : null);
              }}
              onPointerUp={(event) => {
                if (dragPointer.current !== event.pointerId) return;
                const target = rowAtPointer(event);
                clearDrag();
                if (!busy && target) onMove(item.runId, target);
              }}
              onPointerCancel={clearDrag}
              onLostPointerCapture={clearDrag}
              onKeyDown={(event) => {
                if (busy || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                event.preventDefault();
                const target = items[index + (event.key === "ArrowUp" ? -1 : 1)];
                if (target) onMove(item.runId, target.runId);
              }}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
            {item.paused ? <CirclePause aria-hidden="true" className="size-3.5 shrink-0 text-amber-300" /> : <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
            {(editing || item.paused) && (
              <span className="shrink-0 font-medium text-foreground">{editing ? "Editing" : "Paused"}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.message.content}</span>
            {names.length > 0 && (
              <span title={names.join(", ")} aria-label={names.join(", ")} className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <Paperclip aria-hidden="true" className="size-3" />{names.length}
              </span>
            )}
            {index === 0 && item.paused && (
              <button type="button" disabled={busy || Boolean(editingId)} onClick={onResume} aria-label="Resume queued questions" className="rounded px-1.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-surface disabled:opacity-50">
                Resume
              </button>
            )}
            <button type="button" onClick={() => onEdit(item)} disabled={busy || Boolean(editingId)} aria-label={`Edit queued question: ${item.message.content}`} title="Edit queued question" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50">
              <Pencil aria-hidden="true" className="size-3.5" />
            </button>
            <button type="button" onClick={() => onRemove(item.runId)} disabled={busy || editing} aria-label={`Remove queued question: ${item.message.content}`} title="Delete queued question" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50">
              {item.removing ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
