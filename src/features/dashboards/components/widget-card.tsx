"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Line, LineChart, PolarAngleAxis, PolarGrid, Pie, PieChart, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeftRight, ArrowUp, Code2, GripVertical, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { runCustomChart, runDashboardSql } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CHART_LABEL, applyFilters, categoryColumns, formatNumber, numberLikeColumns, gaugeValue, groupedPoints, histogramBins, kpiValue, numericColumns, scatterPoints } from "../logic/aggregate";
import { resultFromSql } from "../logic/sql";
import { GROUPED_TYPES, NUMERIC_X_TYPES } from "../types";
import type { CustomResult, DashboardWidget, DatasetLite, Filters, WidgetType } from "../types";
import type { Reorder } from "../use-reorder";

const COLORS = ["#8fb8a8", "#9db4d8", "#d4b483", "#c49aa8", "#a99bd0", "#7fc2c9"];
const tooltipStyle = { background: "#1d1f21", border: "1px solid #3a3d40", borderRadius: 6, fontSize: 11 };
const spanClass = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3" } as const;

function GaugeDial({ title, value, max }: { title: string; value: number; max: number }) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const arc = Math.PI * 70;
  return (
    <div className="mt-2 flex h-52 flex-col items-center justify-center" role="img" aria-label={`${title}: ${formatNumber(value)} of ${formatNumber(max)}`}>
      <svg viewBox="0 0 180 100" className="w-52">
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" stroke="#2c2f31" strokeWidth="14" strokeLinecap="round" />
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" stroke={COLORS[0]} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${arc * ratio} ${arc}`} />
        <text x="90" y="82" textAnchor="middle" className="fill-foreground text-[22px] font-semibold">{formatNumber(value)}</text>
      </svg>
      <p className="text-[10px] text-muted-foreground">{Math.round(ratio * 100)}% of the highest value ({formatNumber(max)})</p>
    </div>
  );
}

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
  if (widget.type === "gauge") {
    const gauge = gaugeValue(widget, dataset);
    if (!gauge) return <p className="mt-6 text-xs text-muted-foreground">Pick a numeric column for this gauge.</p>;
    return <GaugeDial title={widget.title} value={gauge.value} max={gauge.max} />;
  }
  const empty = dataset.rows.length ? "Pick the columns this chart needs." : "No rows match the current filters.";
  if (widget.type === "histogram") return <ChartView type="histogram" title={widget.title} points={histogramBins(widget, dataset)} emptyText={empty} />;
  if (widget.type === "scatter") return <ChartView type="scatter" title={widget.title} points={[]} dots={scatterPoints(widget, dataset)} xName={widget.x} yName={widget.y} emptyText={empty} />;
  return <ChartView type={widget.type} title={widget.title} points={groupedPoints(widget, dataset)} selected={selected} onSelect={onSelect} emptyText={empty} />;
}

interface ChartViewProps {
  type: WidgetType;
  title: string;
  /** Category/value pairs for every type but scatter. */
  points: Array<{ name: string; value: number }>;
  dots?: Array<{ x: number; y: number }>;
  xName?: string;
  yName?: string;
  selected?: string[];
  onSelect?: (value: string) => void;
  emptyText?: string;
}

/** Draws one chart from ready-made points. Both the preset tiles and the script-built tiles end up here. */
function ChartView({ type, title, points, dots = [], xName, yName, selected = [], onSelect, emptyText = "Pick the columns this chart needs." }: ChartViewProps) {
  const axis = { tick: { fontSize: 10, fill: "#8a9094" } };
  const frame = (chart: React.ReactElement, label: string) => (
    <div className={cn("mt-2 h-52 w-full", Boolean(onSelect) && "[&_.recharts-wrapper]:cursor-pointer")} role="img" aria-label={`${title} ${label}`}><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>
  );
  const valueAxis = <YAxis {...axis} width={44} tickFormatter={(value: number) => formatNumber(Number(value))} />;
  const grid = <CartesianGrid stroke="#2c2f31" vertical={false} />;
  const empty = <p className="mt-6 text-xs text-muted-foreground">{emptyText}</p>;

  if (type === "histogram") {
    const bins = points;
    if (!bins.length) return empty;
    return frame(<BarChart data={bins} barCategoryGap={1}>{grid}<XAxis dataKey="name" {...axis} interval="preserveStartEnd" minTickGap={30} />{valueAxis}<Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff10" }} /><Bar dataKey="value" name="Rows" fill={COLORS[4]} radius={[2, 2, 0, 0]} /></BarChart>, "histogram");
  }
  if (type === "scatter") {
    if (!dots.length) return empty;
    return frame(<ScatterChart margin={{ left: 0, right: 8, top: 8 }}><CartesianGrid stroke="#2c2f31" /><XAxis type="number" dataKey="x" name={xName} domain={["dataMin", "dataMax"]} {...axis} tickFormatter={(value: number) => formatNumber(Number(value))} /><YAxis type="number" dataKey="y" name={yName} domain={["dataMin", "dataMax"]} {...axis} width={44} tickFormatter={(value: number) => formatNumber(Number(value))} /><ZAxis range={[28, 28]} /><Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} /><Scatter data={dots} fill={COLORS[3]} fillOpacity={0.7} /></ScatterChart>, "scatter plot");
  }

  if (!points.length) return empty;
  const dim = (name: string) => (selected.length && !selected.includes(name) ? 0.3 : 1);
  const clickable = Boolean(onSelect);
  const chartClick = (state: { activeLabel?: string | number } | null) => { if (state?.activeLabel !== undefined) onSelect?.(String(state.activeLabel)); };
  const barClick = (entry: unknown) => onSelect?.(String((entry as { name: string }).name));
  switch (type) {
    case "pie":
      return frame(<PieChart><Pie data={points} dataKey="value" nameKey="name" innerRadius={36} outerRadius={70} paddingAngle={2} onClick={(entry) => onSelect?.(String(entry.name))}>{points.map((point, index) => <Cell key={point.name} fill={COLORS[index % COLORS.length]} fillOpacity={dim(point.name)} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>, "chart");
    case "line":
      return frame(<LineChart data={points} onClick={chartClick}>{grid}<XAxis dataKey="name" {...axis} />{valueAxis}<Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={false} /></LineChart>, "chart");
    case "area":
      return frame(<AreaChart data={points} onClick={chartClick}>{grid}<XAxis dataKey="name" {...axis} />{valueAxis}<Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.25} strokeWidth={2} /></AreaChart>, "chart");
    case "hbar":
      return frame(<BarChart data={points} layout="vertical" margin={{ left: 4 }}><CartesianGrid stroke="#2c2f31" horizontal={false} /><XAxis type="number" {...axis} tickFormatter={(value: number) => formatNumber(Number(value))} /><YAxis type="category" dataKey="name" {...axis} width={78} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff10" }} /><Bar dataKey="value" radius={[0, 3, 3, 0]} cursor={clickable ? "pointer" : undefined} onClick={barClick}>{points.map((point, index) => <Cell key={point.name} fill={COLORS[index % COLORS.length]} fillOpacity={dim(point.name)} />)}</Bar></BarChart>, "chart");
    case "radar":
      return frame(<RadarChart data={points} outerRadius="70%"><PolarGrid stroke="#3a3d40" /><PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#8a9094" }} /><Tooltip contentStyle={tooltipStyle} /><Radar dataKey="value" stroke={COLORS[4]} fill={COLORS[4]} fillOpacity={0.3} /></RadarChart>, "chart");
    case "funnel":
      return frame(<FunnelChart><Tooltip contentStyle={tooltipStyle} /><Funnel dataKey="value" nameKey="name" data={points.slice(0, 6).map((point, index) => ({ ...point, fill: COLORS[index % COLORS.length] }))} isAnimationActive={false}><LabelList position="right" dataKey="name" fill="#c9cdd0" fontSize={10} stroke="none" /></Funnel></FunnelChart>, "chart");
    case "treemap":
      return frame(<Treemap data={points.map((point) => ({ ...point }))} dataKey="value" nameKey="name" stroke="#1d1f21" isAnimationActive={false} content={<TreemapCell />} />, "chart");
    default:
      return frame(<BarChart data={points} onClick={undefined}>{grid}<XAxis dataKey="name" {...axis} />{valueAxis}<Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff10" }} /><Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} cursor={clickable ? "pointer" : undefined} onClick={barClick}>{points.map((point) => <Cell key={point.name} fillOpacity={dim(point.name)} />)}</Bar></BarChart>, "chart");
  }
}

function TreemapCell(props: { x?: number; y?: number; width?: number; height?: number; index?: number; name?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name = "" } = props;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={COLORS[index % COLORS.length]} fillOpacity={0.85} stroke="#1d1f21" />
      {width > 54 && height > 18 ? <text x={x + 6} y={y + 14} fontSize={10} fill="#111315">{name.slice(0, Math.floor(width / 6))}</text> : null}
    </g>
  );
}

/** Draws what a script or a query returned, using the same chart components as the preset tiles. */
function ResultBody({ widget, result }: { widget: DashboardWidget; result: CustomResult }) {
  const named = (label: string, value: number) => ({ name: label, value });
  switch (result.kind) {
    case "kpi":
      return <div className="mt-3"><p className="text-3xl font-semibold tracking-tight">{formatNumber(result.value ?? 0)}</p>{result.label ? <p className="mt-1 text-[11px] text-muted-foreground">{result.label}</p> : null}</div>;
    case "gauge":
      return <GaugeDial title={widget.title} value={result.value ?? 0} max={result.max ?? 100} />;
    case "table":
      return (
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-surface text-muted-foreground"><tr>{(result.columns ?? []).map((column) => <th key={column} className="px-2 py-1 font-medium">{column}</th>)}</tr></thead>
            <tbody className="divide-y">{(result.rows ?? []).slice(0, 12).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[140px] truncate px-2 py-1">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "scatter":
      return <ChartView type="scatter" title={widget.title} points={[]} dots={(result.points ?? []).map(([x, y]) => ({ x, y }))} xName="x" yName="y" />;
    default: {
      const points = (result.labels ?? []).map((label, index) => named(label, result.series?.[index] ?? 0));
      return <ChartView type={result.kind as WidgetType} title={widget.title} points={points} emptyText="The query returned no data." />;
    }
  }
}

/** A tile whose chart was written as a Python script by the AI. The server runs the script on the current rows. */
function CustomBody({ widget, dataset }: { widget: DashboardWidget; dataset: DatasetLite | undefined }) {
  const ids = widget.datasets?.length ? widget.datasets : [widget.dataset_id];
  const run = useQuery({
    queryKey: ["custom-run", widget.script, ids, dataset?.row_count ?? dataset?.rows.length ?? 0],
    queryFn: () => runCustomChart(widget.script ?? "", ids),
    enabled: Boolean(widget.script),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (run.isPending) return <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" />Running the script…</p>;
  if (run.isError || !run.data) return <p role="alert" className="mt-6 text-xs text-red-300">{run.error instanceof Error ? run.error.message : "The script could not run."} Ask the AI to rebuild this tile.</p>;
  return <ResultBody widget={widget} result={run.data as CustomResult} />;
}

/** A tile drawn from a read-only SQL query over the dashboard's datasets. */
function SqlBody({ widget, dataset }: { widget: DashboardWidget; dataset: DatasetLite | undefined }) {
  const ids = widget.datasets?.length ? widget.datasets : [widget.dataset_id];
  const run = useQuery({
    queryKey: ["sql-run", widget.sql, ids, dataset?.row_count ?? dataset?.rows.length ?? 0],
    queryFn: () => runDashboardSql(widget.sql ?? "", ids),
    enabled: Boolean(widget.sql),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (run.isPending) return <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" />Running the query…</p>;
  if (run.isError || !run.data) return <p role="alert" className="mt-6 text-xs text-red-300">{run.error instanceof Error ? run.error.message : "The query could not run."}</p>;
  try {
    return <ResultBody widget={widget} result={resultFromSql(widget, run.data)} />;
  } catch (error) {
    return <p role="alert" className="mt-6 text-xs text-red-300">{error instanceof Error ? error.message : "The query result cannot be drawn as this chart type."}</p>;
  }
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
  /** Move buttons and drag handle (edit mode only). */
  reorder?: Reorder;
  /** Opens this widget in the editor panel (edit mode). When given, the column pickers move into that panel. */
  onOpen?: () => void;
  /** This widget is the one open in the editor panel. */
  active?: boolean;
}

const AGG_LABEL = { sum: "Sum of", avg: "Average of", count: "Count of rows" } as const;

/** What the widget computes, in words, so a number can be checked against the data. */
function describe(widget: DashboardWidget, dataset: DatasetLite | undefined): string {
  if (widget.sql) return `SQL query${dataset ? ` · ${dataset.name}` : ""}`;
  if (widget.type === "custom") return widget.request ? `Python script · ${widget.request}` : "Python script";
  if (!dataset) return "";
  if (widget.type === "table") return `Rows of ${dataset.name}`;
  const measure = widget.agg === "count" ? AGG_LABEL.count : `${AGG_LABEL[widget.agg]} ${widget.y ?? "value"}`;
  const by = widget.type !== "kpi" && widget.x ? ` by ${widget.x}` : "";
  return `${measure}${by} · ${dataset.name}`;
}

/** Switching chart type keeps the columns that still make sense and picks sensible ones otherwise. */
export function retype(widget: DashboardWidget, type: WidgetType, dataset: DatasetLite): DashboardWidget {
  const numbers = [...new Set([...numericColumns(dataset), ...numberLikeColumns(dataset)])];
  const categories = categoryColumns(dataset);
  const next: DashboardWidget = { ...widget, type };
  if (type === "histogram") return { ...next, x: numbers.includes(widget.x ?? "") ? widget.x : numbers[0], y: undefined, agg: "count" };
  if (type === "scatter") { const x = numbers.includes(widget.x ?? "") ? widget.x : numbers[0]; return { ...next, x, y: numbers.find((name) => name !== x) ?? x, agg: "sum" }; }
  if (type === "gauge") return { ...next, x: undefined, y: numbers.includes(widget.y ?? "") ? widget.y : numbers[0], agg: "avg" };
  const wasNumericX = NUMERIC_X_TYPES.includes(widget.type) || widget.type === "gauge";
  const x = wasNumericX || !widget.x ? categories[0] ?? dataset.columns[0]?.name : widget.x;
  return { ...next, x, y: widget.y ?? numbers[0], agg: widget.agg === "count" && !widget.y && widget.type !== "gauge" ? "count" : widget.type === "gauge" || NUMERIC_X_TYPES.includes(widget.type) ? "sum" : widget.agg };
}

export function WidgetCard({ widget, dataset, editable, filters = {}, span, onSelect, onChange, onRemove, reorder, onOpen, active }: WidgetCardProps) {
  const next = (value: DashboardWidget["span"]) => (value === 3 ? 1 : ((value + 1) as DashboardWidget["span"]));
  const own = widget.x && GROUPED_TYPES.includes(widget.type) ? widget.x : undefined;
  const effective: Filters = own ? Object.fromEntries(Object.entries(filters).filter(([column]) => column !== own)) : filters;
  const data = dataset ? applyFilters(dataset, effective) : undefined;
  const selected = own ? filters[own] ?? [] : [];
  const types = Object.keys(CHART_LABEL).filter((type) => type !== "kpi" && type !== "table" && type !== "custom") as WidgetType[];
  const numeric = dataset ? [...new Set([...numericColumns(dataset), ...numberLikeColumns(dataset)])] : [];
  const grouped = GROUPED_TYPES.includes(widget.type);
  const column = (label: string, value: string | undefined, options: string[], key: "x" | "y") => <select aria-label={label} value={value ?? ""} onChange={(event) => onChange?.({ ...widget, [key]: event.target.value })} className="h-7 max-w-[150px] rounded border bg-surface px-1.5 text-[11px]">{(value && !options.includes(value) ? [value, ...options] : options).map((name) => <option key={name} value={name}>{name}</option>)}</select>;
  const allColumns = dataset?.columns.map((item) => item.name) ?? [];
  return (
    <article
      className={cn("min-w-0 rounded-xl border bg-surface/50 p-3.5 transition-shadow", spanClass[span ?? widget.span], reorder?.state === "dragging" && "opacity-40", reorder?.state === "over" && "ring-2 ring-sage/70", active && "border-sage/70 ring-1 ring-sage/50")}
      aria-label={widget.title} {...(editable && reorder ? reorder.dragProps : {})}
    >
      <header className="flex items-center gap-2">
        {editable && reorder ? <span aria-hidden="true" title="Drag to rearrange" className="grid size-7 shrink-0 cursor-grab place-items-center rounded text-muted-foreground hover:bg-raised active:cursor-grabbing"><GripVertical className="size-3.5" /></span> : null}
        {editable ? (
          <input aria-label="Widget title" value={widget.title} onChange={(event) => onChange?.({ ...widget, title: event.target.value })} className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-border focus:border-border-strong" />
        ) : <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{widget.title}</h3>}
        {editable ? (
          <>
            {reorder ? (
              <>
                <button type="button" aria-label={`Move ${widget.title} earlier`} title="Move earlier" disabled={reorder.index === 0} onClick={() => reorder.onMove(-1)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button type="button" aria-label={`Move ${widget.title} later`} title="Move later" disabled={reorder.index === reorder.count - 1} onClick={() => reorder.onMove(1)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
              </>
            ) : null}
            {onOpen ? <button type="button" aria-label={`Edit ${widget.title}`} title="Edit this widget: tables, query, type" onClick={onOpen} className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-raised hover:text-foreground"><Pencil className="size-3.5" />Edit</button> : null}
            <button type="button" aria-label={`Resize ${widget.title}`} title={`Width ${widget.span}/3, click to change`} onClick={() => onChange?.({ ...widget, span: next(widget.span) })} className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-raised hover:text-foreground"><ArrowLeftRight className="size-3" />{widget.span}/3</button>
            <button type="button" aria-label={`Remove ${widget.title}`} onClick={onRemove} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-red-300"><Trash2 className="size-3.5" /></button>
          </>
        ) : null}
      </header>
      {!editable && dataset ? <p className="truncate px-0.5 text-[10px] text-muted-foreground" title={describe(widget, dataset)}>{describe(widget, dataset)}</p> : null}
      {editable && !onOpen && dataset && widget.type !== "kpi" && widget.type !== "table" && widget.type !== "custom" && !widget.sql ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <select aria-label="Chart type" value={widget.type} onChange={(event) => onChange?.(retype(widget, event.target.value as WidgetType, dataset))} className="h-7 rounded border bg-surface px-1.5 text-[11px]">{types.map((type) => <option key={type} value={type}>{CHART_LABEL[type]}</option>)}</select>
          {grouped ? column("Category column", widget.x, allColumns, "x") : null}
          {grouped ? <select aria-label="Aggregate" value={widget.agg} onChange={(event) => onChange?.({ ...widget, agg: event.target.value as DashboardWidget["agg"] })} className="h-7 rounded border bg-surface px-1.5 text-[11px]"><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count</option></select> : null}
          {grouped && widget.agg !== "count" ? column("Value column", widget.y, allColumns, "y") : null}
          {widget.type === "histogram" ? column("Numeric column", widget.x, numeric, "x") : null}
          {widget.type === "scatter" ? <>{column("X column", widget.x, numeric, "x")}{column("Y column", widget.y, numeric, "y")}</> : null}
          {widget.type === "gauge" ? column("Value column", widget.y, numeric, "y") : null}
        </div>
      ) : null}
      {widget.sql ? <SqlBody widget={widget} dataset={dataset} /> : widget.type === "custom" ? (
        <>
          <details className="mt-1 text-[10px] text-muted-foreground">
            <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"><Code2 className="size-3" />Built by an AI-written Python script</summary>
            {widget.request ? <p className="mt-1">Asked for: {widget.request}</p> : null}
            <pre className="mt-1 max-h-40 overflow-auto rounded border bg-surface p-2 font-mono text-[10px] leading-snug text-foreground">{widget.script}</pre>
          </details>
          <CustomBody widget={widget} dataset={dataset} />
        </>
      ) : data ? <WidgetBody widget={widget} dataset={data} selected={selected} onSelect={own && onSelect ? (value) => onSelect(own, value) : undefined} /> : <p className="mt-6 text-xs text-muted-foreground">This widget’s dataset is no longer in your Library.</p>}
    </article>
  );
}
