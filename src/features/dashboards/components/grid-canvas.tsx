"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COLS, MIN_H, MIN_W, rowsOf, settle } from "../logic/grid";
import type { Layouts } from "../logic/grid";
import type { DashboardWidget } from "../types";

const ROW_H = 56;
const GAP = 12;
const NARROW = 640;

export interface GridHandle { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }

interface GridCanvasProps {
  widgets: DashboardWidget[];
  layouts: Layouts;
  /** Drag and resize only work while unlocked. */
  unlocked: boolean;
  onLayouts: (layouts: Layouts) => void;
  render: (widget: DashboardWidget, handle: GridHandle | undefined) => ReactNode;
}

interface Gesture { id: string; kind: "move" | "size"; x: number; y: number; from: Layouts }

/** A free grid: tiles sit at any column/row and any size. While unlocked, the grip moves a tile and the corner resizes it. */
export function GridCanvas({ widgets, layouts, unlocked, onLayouts, render }: GridCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [live, setLive] = useState<Layouts | null>(null);
  /** Pointer offset in pixels, so the held tile follows the pointer exactly while the others snap. */
  const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const liveRef = useRef<Layouts | null>(null);
  const lastKey = useRef("");

  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => { if (node.clientWidth) setWidth(node.clientWidth); });
    watch.observe(node);
    if (node.clientWidth) setWidth(node.clientWidth);
    return () => watch.disconnect();
  }, []);

  const narrow = width < NARROW;
  const colW = (width - GAP * (COLS - 1)) / COLS;
  const shown = live ?? layouts;

  function start(id: string, kind: Gesture["kind"], event: ReactPointerEvent<HTMLElement>) {
    if (!unlocked || narrow) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id, kind, x: event.clientX, y: event.clientY, from: layouts };
    liveRef.current = layouts;
    setLive(layouts);
    setDelta({ x: 0, y: 0 });
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const dc = Math.round((event.clientX - g.x) / (colW + GAP));
    const dr = Math.round((event.clientY - g.y) / (ROW_H + GAP));
    const base = g.from[g.id];
    setDelta({ x: event.clientX - g.x, y: event.clientY - g.y });
    const next = g.kind === "move"
      ? { ...base, c: Math.min(COLS - base.w, Math.max(0, base.c + dc)), r: Math.max(0, base.r + dr) }
      : { ...base, w: Math.min(COLS - base.c, Math.max(MIN_W, base.w + dc)), h: Math.max(MIN_H, base.h + dr) };
    const key = `${next.c},${next.r},${next.w},${next.h}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const settled = settle({ ...g.from, [g.id]: next }, g.id);
    liveRef.current = settled;
    setLive(settled);
  }

  function end() {
    const done = liveRef.current;
    if (gesture.current && delta && Math.hypot(delta.x, delta.y) > 4) {
      // The pointer-up after a drag would also click the tile (and open its editor); swallow that one click.
      const swallow = (event: MouseEvent) => { event.stopPropagation(); event.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
    gesture.current = null;
    liveRef.current = null;
    lastKey.current = "";
    setLive(null);
    setDelta(null);
    if (done && JSON.stringify(done) !== JSON.stringify(layouts)) onLayouts(done);
  }

  const active = gesture.current?.id;
  const box_ = (cell: { c: number; r: number; w: number; h: number }) => ({ left: cell.c * (colW + GAP), top: cell.r * (ROW_H + GAP), width: cell.w * colW + (cell.w - 1) * GAP, height: cell.h * ROW_H + (cell.h - 1) * GAP });
  const held = (id: string) => {
    const g = gesture.current;
    if (!g || g.id !== id || !delta) return null;
    const from = box_(g.from[id]);
    return g.kind === "move"
      ? { ...from, left: from.left + delta.x, top: from.top + delta.y }
      : { ...from, width: Math.max(colW, from.width + delta.x), height: Math.max(ROW_H * MIN_H, from.height + delta.y) };
  };
  return (
    <div
      ref={box}
      className={cn("relative", unlocked && !narrow && "rounded-lg bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] [background-size:calc((100%+12px)/12)_100%] bg-origin-border")}
      style={narrow ? undefined : { height: Math.max(1, rowsOf(shown)) * (ROW_H + GAP) }}
      data-testid="grid-canvas"
    >
      {active && live?.[active] ? <div aria-hidden="true" style={box_(live[active])} className="pointer-events-none absolute rounded-lg border-2 border-dashed border-sage/60 bg-sage/10 transition-[left,top,width,height] duration-150 ease-out" /> : null}
      {widgets.map((widget) => {
        const cell = shown[widget.id];
        if (!cell) return null;
        const style = narrow
          ? { height: cell.h * ROW_H + (cell.h - 1) * GAP, marginBottom: GAP }
          : held(widget.id) ?? box_(cell);
        return (
          <div key={widget.id} style={style} className={cn(!narrow && "absolute transition-[left,top,width,height] duration-200 ease-out", active === widget.id && "z-20 cursor-grabbing opacity-95 shadow-2xl ring-1 ring-sage/50 transition-none")}
            onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {render(widget, unlocked && !narrow ? { onPointerDown: (event) => start(widget.id, "move", event) } : undefined)}
            {unlocked && !narrow ? (
              <span
                role="separator" aria-label={`Resize ${widget.title}`} title="Drag to resize"
                onPointerDown={(event) => start(widget.id, "size", event)}
                className="absolute bottom-0.5 right-0.5 size-5 cursor-nwse-resize touch-none rounded-sm border-b-2 border-r-2 border-sage/80"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
