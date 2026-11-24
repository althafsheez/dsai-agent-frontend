"use client";

import { useEffect, useRef } from "react";
import { Minus, PanelRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHART_LABEL } from "../logic/aggregate";
import { COLS, MIN_H, MIN_W } from "../logic/grid";
import type { DashboardWidget, DatasetLite, WidgetLayout, WidgetType } from "../types";
import { retype } from "./widget-card";

const PRESETS: Array<[string, number]> = [["⅓", 4], ["½", 6], ["⅔", 8], ["Full", 12]];
const TYPES = Object.keys(CHART_LABEL).filter((type) => type !== "kpi" && type !== "table" && type !== "custom") as WidgetType[];

interface QuickEditProps {
  widget: DashboardWidget;
  dataset: DatasetLite | undefined;
  layout: WidgetLayout;
  onLayout: (layout: WidgetLayout) => void;
  onChange: (widget: DashboardWidget) => void;
  onMore: () => void;
  onClose: () => void;
}

function Stepper({ label, value, min, max, onValue }: { label: string; value: number; min: number; max?: number; onValue: (value: number) => void }) {
  const button = "grid size-7 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onValue(value - 1)} className={button}><Minus className="size-3" /></button>
        <span aria-label={label} className="w-10 text-center text-xs tabular-nums">{value}{max ? `/${max}` : ""}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={max !== undefined && value >= max} onClick={() => onValue(value + 1)} className={button}><Plus className="size-3" /></button>
      </div>
    </div>
  );
}

/** Small changes right next to a tile: its size, and for chart tiles the chart type. Bigger changes go to the side panel. */
export function QuickEdit({ widget, dataset, layout, onLayout, onChange, onMore, onClose }: QuickEditProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => { if (box.current && !box.current.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  const chart = dataset && TYPES.includes(widget.type) && !widget.sql;

  return (
    <div ref={box} role="dialog" aria-label={`Quick edit ${widget.title}`} className="absolute right-2 top-11 z-40 w-60 animate-pop-in space-y-2.5 rounded-xl border border-border-strong bg-sidebar p-3 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Quick edit</p>
        <button type="button" aria-label="Close quick edit" onClick={onClose} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-3.5" /></button>
      </div>
      <Stepper label="Width" value={layout.w} min={MIN_W} max={COLS} onValue={(w) => onLayout({ ...layout, w })} />
      <Stepper label="Height" value={layout.h} min={MIN_H} onValue={(h) => onLayout({ ...layout, h })} />
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Width presets">
        {PRESETS.map(([label, w]) => (
          <button key={label} type="button" aria-pressed={layout.w === w} onClick={() => onLayout({ ...layout, w })} className={cn("h-7 rounded-md border text-[11px] hover:border-border-strong", layout.w === w ? "border-sage/70 bg-sage/10 text-foreground" : "bg-surface text-muted-foreground")}>{label}</button>
        ))}
      </div>
      {chart ? (
        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">Chart type
          <select aria-label="Chart type" value={widget.type} onChange={(event) => onChange(retype(widget, event.target.value as WidgetType, dataset))} className="h-7 rounded-md border bg-surface px-1.5 text-[11px] text-foreground">
            {TYPES.map((type) => <option key={type} value={type}>{CHART_LABEL[type]}</option>)}
          </select>
        </label>
      ) : null}
      <button type="button" onClick={onMore} className="flex w-full items-center justify-center gap-1.5 rounded-md border bg-surface py-1.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground"><PanelRight className="size-3.5" />Query and data (Info)</button>
    </div>
  );
}
