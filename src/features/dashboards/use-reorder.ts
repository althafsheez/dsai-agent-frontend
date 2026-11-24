"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { moveItem } from "./logic/layout";

export interface Reorder {
  index: number;
  count: number;
  state: "idle" | "dragging" | "over";
  onMove: (delta: -1 | 1) => void;
  dragProps: { draggable: true; onDragStart: (event: DragEvent) => void; onDragOver: (event: DragEvent) => void; onDrop: (event: DragEvent) => void; onDragEnd: () => void };
}

/** Rearranging tiles by dragging one onto another, or with the move buttons. */
export function useReorder<T extends { id: string }>(items: T[], onChange: (next: T[]) => void): (id: string) => Reorder {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const clear = () => { setDragging(null); setOver(null); };
  return (id) => {
    const index = items.findIndex((item) => item.id === id);
    return {
      index, count: items.length,
      state: dragging === id ? "dragging" : over === id && dragging ? "over" : "idle",
      onMove: (delta) => onChange(moveItem(items, index, index + delta)),
      dragProps: {
        draggable: true,
        onDragStart: (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); setDragging(id); },
        onDragOver: (event) => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (over !== id) setOver(id); },
        onDrop: (event) => { event.preventDefault(); if (dragging && dragging !== id) onChange(moveItem(items, items.findIndex((item) => item.id === dragging), index)); clear(); },
        onDragEnd: clear,
      },
    };
  };
}
