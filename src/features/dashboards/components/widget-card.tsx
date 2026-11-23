"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyFilters, formatNumber, groupedPoints, kpiValue } from "../logic/aggregate";
import type { DashboardWidget, DatasetLite, Filters } from "../types";

const COLORS = ["#8fb8a8", "#9db4d8", "#d4b483", "#c49aa8", "#a99bd0", "#7fc2c9"];
const tooltipStyle = { background: "#1d1f21", border: "1px solid #3a3d40", borderRadius: 6, fontSize: 11 };
const spanClass = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3" } as const;

interface BodyProps { widget: DashboardWidget; dataset: DatasetLite; selected: string[]; onSelect?: (value: string) => void }

function WidgetBody({ widget, dataset, selected, onSelect }: BodyProps) {
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
        <p className="px-2 pt-1.5 text-[10px] text-muted-foreground">Showing {Math.min(10, dataset.rows.length)} of {(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows</p>
      </div>
    );
  }
  const points = groupedPoints(widget, dataset);
  if (!points.length) return <p className="mt-6 text-xs text-muted-foreground">{dataset.rows.length ? "Pick a category column to draw this chart." : "No rows match the current filters."}</p>;
  const dim = (name: string) => (selected.length && !selected.includes(name) ? 0.3 : 1);
  const clickable = Boolean(onSelect);
  const chartClick = (state: { activeLabel?: string | number } | null) => { if (state?.activeLabel !== undefined) onSelect?.(String(state.activeLabel)); };
  const axis = { tick: { fontSize: 10, fill: "#8a9094" } };
  return (
    <div className={cn("mt-2 h-52 w-full", clickable && "[&_.recharts-wrapper]:cursor-pointer")} role="img" aria-label={`${widget.title} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        {widget.type === "pie" ? (
          <PieChart><Pie data={points} dataKey="value" nameKey="name" innerRadius={36} outerRadius={70} paddingAngle={2} onClick={(entry) => onSelect?.(String(entry.name))}>{points.map((point, index) => <Cell key={point.name} fill={COLORS[index % COLORS.length]} fillOpacity={dim(point.name)} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
        ) : widget.type === "line" ? (
          <LineChart data={points} onClick={chartClick}><CartesianGrid stroke="#2c2f31" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} width={44} tickFormatter={(value: number) => formatNumber(Number(value))} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={false} /></LineChart>
        ) : widget.type === "area" ? (
          <AreaChart data={points} onClick={chartClick}><CartesianGrid stroke="#2c2f31" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} width={44} tickFormatter={(value: number) => formatNumber(Number(value))} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.25} strokeWidth={2} /></AreaChart>
        ) : (
          <BarChart data={points}><CartesianGrid stroke="#2c2f31" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} width={44} tickFormatter={(value: number) => formatNumber(Number(value))} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff10" }} /><Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} cursor={clickable ? "pointer" : undefined} onClick={(entry) => onSelect?.(String((entry as unknown as { name: string }).name))}>{points.map((point) => <Cell key={point.name} fillOpacity={dim(point.name)} />)}</Bar></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

interface WidgetCardProps {
  widget: DashboardWidget;
  dataset: DatasetLite | undefined;
  editable?: boolean;
  /** Active filters; this widget's own category column is not filtered so its other bars stay visible. */
  filters?: Filters;
  /** Width actually drawn (after row packing); defaults to the saved span. */
  span?: 1 | 2 | 3;
  onSelect?: (column: string, value: string) => void;
  onChange?: (widget: DashboardWidget) => void;
  onRemove?: () => void;
}

const AGG_LABEL = { sum: "Sum of", avg: "Average of", count: "Count of rows" } as const;

/** What the widget computes, in words, so a number can be checked against the data. */
function describe(widget: DashboardWidget, dataset: DatasetLite | undefined): string {
  if (!dataset) return "";
  if (widget.type === "table") return `Rows of ${dataset.name}`;
  const measure = widget.agg === "count" ? AGG_LABEL.count : `${AGG_LABEL[widget.agg]} ${widget.y ?? "value"}`;
  const by = widget.type !== "kpi" && widget.x ? ` by ${widget.x}` : "";
  return `${measure}${by} · ${dataset.name}`;
}

export function WidgetCard({ widget, dataset, editable, filters = {}, span, onSelect, onChange, onRemove }: WidgetCardProps) {
  const next = (value: DashboardWidget["span"]) => (value === 3 ? 1 : ((value + 1) as DashboardWidget["span"]));
  const own = widget.x && widget.type !== "kpi" && widget.type !== "table" ? widget.x : undefined;
  const effective: Filters = own ? Object.fromEntries(Object.entries(filters).filter(([column]) => column !== own)) : filters;
  const data = dataset ? applyFilters(dataset, effective) : undefined;
  const selected = own ? filters[own] ?? [] : [];
  const types = ["bar", "line", "area", "pie"] as const;
  return (
    <article className={cn("min-w-0 rounded-xl border bg-surface/50 p-3.5", spanClass[span ?? widget.span])} aria-label={widget.title}>
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
      {!editable && dataset ? <p className="truncate px-0.5 text-[10px] text-muted-foreground" title={describe(widget, dataset)}>{describe(widget, dataset)}</p> : null}
      {editable && dataset && widget.type !== "kpi" && widget.type !== "table" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <select aria-label="Chart type" value={widget.type} onChange={(event) => onChange?.({ ...widget, type: event.target.value as DashboardWidget["type"] })} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{types.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select>
          <select aria-label="Category column" value={widget.x ?? ""} onChange={(event) => onChange?.({ ...widget, x: event.target.value })} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
          <select aria-label="Aggregate" value={widget.agg} onChange={(event) => onChange?.({ ...widget, agg: event.target.value as DashboardWidget["agg"] })} className="h-7 rounded border bg-surface px-1.5 text-[11px]"><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count</option></select>
          {widget.agg !== "count" ? <select aria-label="Value column" value={widget.y ?? ""} onChange={(event) => onChange?.({ ...widget, y: event.target.value })} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select> : null}
        </div>
      ) : null}
      {data ? <WidgetBody widget={widget} dataset={data} selected={selected} onSelect={own && onSelect ? (value) => onSelect(own, value) : undefined} /> : <p className="mt-6 text-xs text-muted-foreground">This widget’s dataset is no longer in your Library.</p>}
    </article>
  );
}
