"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, groupedPoints, kpiValue } from "../logic/aggregate";
import type { DashboardWidget, DatasetLite } from "../types";

const COLORS = ["#8fb8a8", "#9db4d8", "#d4b483", "#c49aa8", "#a99bd0", "#7fc2c9"];
const tooltipStyle = { background: "#1d1f21", border: "1px solid #3a3d40", borderRadius: 6, fontSize: 11 };
const spanClass = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3" } as const;

function WidgetBody({ widget, dataset }: { widget: DashboardWidget; dataset: DatasetLite }) {
  if (widget.type === "kpi") {
    return <p className="mt-3 text-3xl font-semibold tracking-tight">{formatNumber(kpiValue(widget, dataset))}</p>;
  }
  if (widget.type === "table") {
    return (
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-surface text-muted-foreground"><tr>{dataset.columns.map((column) => <th key={column.name} className="px-2 py-1 font-medium">{column.name}</th>)}</tr></thead>
          <tbody className="divide-y">{dataset.rows.slice(0, 10).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[140px] truncate px-2 py-1">{String(cell ?? "")}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  const points = groupedPoints(widget, dataset);
  if (!points.length) return <p className="mt-6 text-xs text-muted-foreground">Pick a category column to draw this chart.</p>;
  return (
    <div className="mt-2 h-52 w-full" role="img" aria-label={`${widget.title} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        {widget.type === "pie" ? (
          <PieChart><Pie data={points} dataKey="value" nameKey="name" innerRadius={36} outerRadius={70} paddingAngle={2}>{points.map((point, index) => <Cell key={point.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
        ) : widget.type === "line" ? (
          <LineChart data={points}><CartesianGrid stroke="#2c2f31" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8a9094" }} /><YAxis tick={{ fontSize: 10, fill: "#8a9094" }} width={36} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={false} /></LineChart>
        ) : (
          <BarChart data={points}><CartesianGrid stroke="#2c2f31" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8a9094" }} /><YAxis tick={{ fontSize: 10, fill: "#8a9094" }} width={36} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff10" }} /><Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} /></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

interface WidgetCardProps {
  widget: DashboardWidget;
  dataset: DatasetLite | undefined;
  editable?: boolean;
  onChange?: (widget: DashboardWidget) => void;
  onRemove?: () => void;
}

export function WidgetCard({ widget, dataset, editable, onChange, onRemove }: WidgetCardProps) {
  const next = (span: DashboardWidget["span"]) => (span === 3 ? 1 : ((span + 1) as DashboardWidget["span"]));
  return (
    <article className={cn("min-w-0 rounded-xl border bg-surface/50 p-3.5", spanClass[widget.span])} aria-label={widget.title}>
      <header className="flex items-center gap-2">
        {editable ? (
          <input aria-label="Widget title" value={widget.title} onChange={(event) => onChange?.({ ...widget, title: event.target.value })} className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-border focus:border-border-strong" />
        ) : <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{widget.title}</h3>}
        {editable ? (
          <>
            <button type="button" aria-label={`Resize ${widget.title}`} title={`Width ${widget.span}/3, click to change`} onClick={() => onChange?.({ ...widget, span: next(widget.span) })} className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-raised hover:text-foreground"><ArrowLeftRight className="size-3" />{widget.span}/3</button>
            <button type="button" aria-label={`Remove ${widget.title}`} onClick={onRemove} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-red-300"><Trash2 className="size-3.5" /></button>
          </>
        ) : null}
      </header>
      {editable && dataset && widget.type !== "kpi" && widget.type !== "table" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <select aria-label="Category column" value={widget.x ?? ""} onChange={(event) => onChange?.({ ...widget, x: event.target.value })} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
          <select aria-label="Aggregate" value={widget.agg} onChange={(event) => onChange?.({ ...widget, agg: event.target.value as DashboardWidget["agg"] })} className="h-7 rounded border bg-surface px-1.5 text-[11px]"><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count</option></select>
          {widget.agg !== "count" ? <select aria-label="Value column" value={widget.y ?? ""} onChange={(event) => onChange?.({ ...widget, y: event.target.value })} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select> : null}
        </div>
      ) : null}
      {dataset ? <WidgetBody widget={widget} dataset={dataset} /> : <p className="mt-6 text-xs text-muted-foreground">This widget’s dataset is no longer in your Library.</p>}
    </article>
  );
}
