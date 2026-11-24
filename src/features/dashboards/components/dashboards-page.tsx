"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil, Pin, Plus, Search, Share2, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboards, useDeleteDashboard, useDuplicateDashboard, usePinDashboard, useSaveDashboard } from "../use-dashboards";
import { roleOf } from "../types";
import type { Dashboard } from "../types";
import { ShareDialog } from "./share-dialog";

type Ownership = "all" | "owned" | "shared" | "pinned";
type Sort = "updated_desc" | "updated_asc" | "name_asc";
type PreviewTile = NonNullable<Dashboard["preview"]>["tiles"][number];

const ownershipOptions: Array<{ value: Ownership; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "shared", label: "Shared" },
  { value: "pinned", label: "Pinned" },
];

const tones = ["var(--sage)", "var(--slate)", "var(--muted-foreground)", "var(--border-strong)", "#a99bd0", "#d4b483"];
const shorten = (value: number) => (Math.abs(value) >= 1e6 ? `${+(value / 1e6).toFixed(1)}M` : Math.abs(value) >= 1e4 ? `${+(value / 1e3).toFixed(1)}K` : `${+value.toFixed(1)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

interface Box { x: number; y: number; w: number; h: number; index: number }
/** Slice-and-dice treemap: split the sorted values in two halves, alternating direction. */
function layoutTreemap(values: number[], x: number, y: number, w: number, h: number, offset = 0): Box[] {
  if (values.length === 1) return [{ x, y, w, h, index: offset }];
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  let running = 0;
  let cut = 1;
  while (cut < values.length - 1 && running + values[cut - 1] < total / 2) { running += values[cut - 1]; cut += 1; }
  const first = values.slice(0, cut).reduce((sum, value) => sum + value, 0) / total;
  return w >= h
    ? [...layoutTreemap(values.slice(0, cut), x, y, w * first, h, offset), ...layoutTreemap(values.slice(cut), x + w * first, y, w * (1 - first), h, offset + cut)]
    : [...layoutTreemap(values.slice(0, cut), x, y, w, h * first, offset), ...layoutTreemap(values.slice(cut), x, y + h * first, w, h * (1 - first), offset + cut)];
}

/** One widget of the dashboard, drawn small, in the same type it has inside. Hover or focus to read values. */
function MiniTile({ tile, large = false, bare = false }: { tile: PreviewTile; large?: boolean; bare?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const series = tile.series ?? [];
  const labels = tile.labels ?? [];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const hit = (index: number) => ({ onMouseEnter: () => setActive(index), onFocus: () => setActive(index), onMouseLeave: () => setActive(null), onBlur: () => setActive(null) });
  const readout = active === null ? tile.title : `${labels[active]}: ${shorten(series[active])}`;
  const head = bare ? null : <p className={cn("truncate text-muted-foreground", large ? "h-4 text-[11px] leading-4" : "h-3 text-[9px] leading-3")}>{readout}</p>;
  const label = (index: number) => `${labels[index]}: ${shorten(series[index])}`;
  let body: React.ReactNode = null;

  if (tile.type === "kpi") {
    return <div className="min-w-0"><p className={cn("truncate font-semibold tracking-tight", large ? "text-2xl leading-8" : "text-xs leading-4")}>{tile.value}</p><p className={cn("truncate text-muted-foreground", large ? "text-[11px] leading-4" : "text-[9px] leading-3")}>{tile.title}</p></div>;
  }
  if (tile.type === "gauge") {
    const arc = Math.PI * 34;
    body = (
      <svg viewBox="0 0 90 54" className="mx-auto h-full" role="img" aria-label={`${tile.title}: ${tile.value} of ${tile.max}`}>
        <path d="M10,48 A34,34 0 0 1 80,48" fill="none" stroke="var(--border)" strokeWidth="7" strokeLinecap="round" />
        <path d="M10,48 A34,34 0 0 1 80,48" fill="none" stroke="var(--sage)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${arc * (tile.ratio ?? 0)} ${arc}`} />
        <text x="45" y="46" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">{tile.value}</text>
      </svg>
    );
  } else if (tile.type === "bar" || tile.type === "histogram") {
    body = (
      <div className="flex h-full items-end gap-[3px]">
        {series.map((value, index) => (
          <button key={index} type="button" aria-label={label(index)} {...hit(index)} className="flex h-full min-w-0 flex-1 items-end focus-visible:outline-none">
            <span className="block w-full rounded-[2px] transition-opacity" style={{ height: `${Math.max((value / max) * 100, 4)}%`, background: active === index ? "var(--sage)" : tile.type === "histogram" ? tones[4] : "var(--slate)", opacity: active === null || active === index ? 1 : 0.4 }} />
          </button>
        ))}
      </div>
    );
  } else if (tile.type === "hbar" || tile.type === "funnel") {
    body = (
      <div className="flex h-full flex-col justify-between gap-[3px]">
        {series.slice(0, 5).map((value, index) => (
          <button key={index} type="button" aria-label={label(index)} {...hit(index)} className={cn("flex min-h-0 flex-1 items-center focus-visible:outline-none", tile.type === "funnel" && "justify-center")}>
            <span className="block h-full rounded-[2px] transition-opacity" style={{ width: `${Math.max((value / max) * 100, 6)}%`, background: tile.type === "funnel" ? tones[index % tones.length] : active === index ? "var(--sage)" : "var(--slate)", opacity: active === null || active === index ? 1 : 0.4 }} />
          </button>
        ))}
      </div>
    );
  } else if (tile.type === "line" || tile.type === "area") {
    const range = max - min || 1;
    const pts = series.map((value, index) => ({ x: (index / Math.max(series.length - 1, 1)) * 100, y: 40 - 4 - ((value - min) / range) * 32 }));
    const line = pts.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const tone = tile.type === "area" ? "var(--sage)" : "var(--slate)";
    const at = pts[active ?? pts.length - 1];
    body = (
      <div className="relative h-full">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={tile.title}>
          {tile.type === "area" && <path d={`${line} L100,40 L0,40 Z`} fill={tone} opacity="0.16" />}
          <path d={line} fill="none" stroke={tone} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {active !== null && <line x1={at.x} x2={at.x} y1="0" y2="40" stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${at.x}%`, top: `${(at.y / 40) * 100}%`, background: tone }} />
        <div className="absolute inset-0 flex">{series.map((_, index) => <button key={index} type="button" aria-label={label(index)} {...hit(index)} className="h-full flex-1 focus-visible:outline-none" />)}</div>
      </div>
    );
  } else if (tile.type === "pie") {
    const total = series.reduce((sum, value) => sum + value, 0) || 1;
    let offset = 0;
    const circumference = 2 * Math.PI * 14;
    body = (
      <div className="flex h-full items-center justify-center gap-3">
        <svg viewBox="0 0 40 40" className="h-full -rotate-90" role="img" aria-label={tile.title}>
          {series.map((value, index) => {
            const length = (value / total) * circumference;
            const circle = <circle key={index} cx="20" cy="20" r="14" fill="none" stroke={tones[index % tones.length]} strokeWidth={active === index ? 8 : 6} strokeDasharray={`${Math.max(length - 1, 0)} ${circumference}`} strokeDashoffset={-offset} className="cursor-pointer transition-all" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} />;
            offset += length;
            return circle;
          })}
        </svg>
        {(tile.span ?? 1) > 1 && <ul className="min-w-0 space-y-0.5">{series.slice(0, 3).map((value, index) => <li key={index} {...hit(index)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full" style={{ background: tones[index % tones.length] }} /><span className="max-w-[70px] truncate">{labels[index]}</span><span className="tabular-nums">{Math.round((value / total) * 100)}%</span></li>)}</ul>}
      </div>
    );
  } else if (tile.type === "radar") {
    const count = series.length;
    const point = (index: number, ratio: number) => `${(50 + Math.sin((index / count) * 2 * Math.PI) * 38 * ratio).toFixed(1)},${(50 - Math.cos((index / count) * 2 * Math.PI) * 38 * ratio).toFixed(1)}`;
    body = (
      <svg viewBox="0 0 100 100" className="mx-auto h-full" role="img" aria-label={tile.title}>
        {[0.5, 1].map((ratio) => <polygon key={ratio} points={series.map((_, index) => point(index, ratio)).join(" ")} fill="none" stroke="var(--border)" />)}
        <polygon points={series.map((value, index) => point(index, Math.max(value / max, 0.05))).join(" ")} fill={tones[4]} fillOpacity="0.3" stroke={tones[4]} strokeWidth="1.5" />
        {series.map((value, index) => <circle key={index} cx={point(index, Math.max(value / max, 0.05)).split(",")[0]} cy={point(index, Math.max(value / max, 0.05)).split(",")[1]} r={active === index ? 3.5 : 2} fill={tones[4]} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} />)}
      </svg>
    );
  } else if (tile.type === "treemap") {
    const boxes = layoutTreemap(series, 0, 0, 100, 40);
    body = (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={tile.title}>
        {boxes.map((box) => <rect key={box.index} x={box.x + 0.4} y={box.y + 0.4} width={Math.max(box.w - 0.8, 0)} height={Math.max(box.h - 0.8, 0)} fill={tones[box.index % tones.length]} opacity={active === null || active === box.index ? 0.9 : 0.4} onMouseEnter={() => setActive(box.index)} onMouseLeave={() => setActive(null)} />)}
      </svg>
    );
  } else if (tile.type === "scatter") {
    const points = tile.points ?? [];
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const [xLow, xHigh, yLow, yHigh] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    body = (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={tile.title}>
        {points.map((point, index) => <circle key={index} cx={4 + ((point[0] - xLow) / (xHigh - xLow || 1)) * 92} cy={36 - ((point[1] - yLow) / (yHigh - yLow || 1)) * 32} r="1.3" fill={tones[5]} opacity="0.75" />)}
      </svg>
    );
  } else if (tile.type === "table") {
    return (
      <div className="min-w-0 overflow-hidden">
        <p className="h-3.5 truncate text-[10px] leading-3.5 text-muted-foreground">{tile.title}</p>
        <table className="mt-1 w-full table-fixed text-left text-[9px] text-muted-foreground">
          <thead><tr>{(tile.columns ?? []).map((column) => <th key={column} className="truncate pr-1 font-medium text-foreground">{column}</th>)}</tr></thead>
          <tbody>{(tile.rows ?? []).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="truncate pr-1">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return <div className="flex h-full min-w-0 flex-col">{head}<div className={cn("min-h-0 flex-1", !bare && "mt-1")}>{body}</div></div>;
}

function Menu({ dashboard, onPin, onRename, onShare, onDelete, onDuplicate }: { dashboard: Dashboard; onPin: () => void; onRename: () => void; onShare: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const role = roleOf(dashboard);
  const toggle = () => {
    // Open upwards when the card sits near the bottom of the screen, so no item is cut off.
    const bottom = box.current?.getBoundingClientRect().bottom ?? 0;
    setUp(window.innerHeight - bottom < 230);
    setOpen((value) => !value);
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised focus-visible:bg-raised focus-visible:outline-none";
  const run = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div ref={box} className="relative -mr-1.5 -mt-0.5 shrink-0">
      <button type="button" aria-label={`Actions for ${dashboard.name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className={cn("absolute right-0 z-30 w-44", up ? "bottom-8" : "top-8", "rounded-md border bg-popover p-1 shadow-lg")}>
          <Link role="menuitem" href={`/dashboards/${dashboard.id}`} className={item}><ExternalLink className="size-3.5" /> Open</Link>
          <button type="button" role="menuitem" onClick={run(onPin)} className={item}><Pin className="size-3.5" /> {dashboard.pinned ? "Unpin" : "Pin"}</button>
          {role !== "viewer" && <button type="button" role="menuitem" onClick={run(onRename)} className={item}><Pencil className="size-3.5" /> Rename</button>}
          <button type="button" role="menuitem" onClick={run(onDuplicate)} className={item}><Copy className="size-3.5" /> Duplicate</button>
          {role === "owner" && <button type="button" role="menuitem" onClick={run(onShare)} className={item}><Share2 className="size-3.5" /> Share…</button>}
          {role === "owner" && <button type="button" role="menuitem" onClick={run(onDelete)} className={cn(item, "text-destructive")}><Trash2 className="size-3.5" /> Delete</button>}
        </div>
      )}
    </div>
  );
}

/** The first number and the first chart of a dashboard: what the card shows above its title. */
function pickHighlights(tiles: PreviewTile[]): { headline?: PreviewTile; chart?: PreviewTile } {
  const headline = tiles.find((tile) => tile.type === "kpi");
  const chart = tiles.find((tile) => ["line", "area", "bar", "hbar", "histogram", "pie"].includes(tile.type) && (tile.series?.length ?? 0) >= 2)
    ?? tiles.find((tile) => tile.type !== "kpi" && tile.type !== "table") ?? tiles.find((tile) => tile !== headline);
  return { headline, chart: chart === headline ? undefined : chart };
}

const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return `${Math.floor(minutes / 10080)}w ago`;
}

const chartWidth = 280;
const chartHeight = 72;

function toPoints(series: number[]) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  return series.map((value, index) => ({
    x: (index / (series.length - 1)) * chartWidth,
    y: chartHeight - 6 - ((value - min) / range) * (chartHeight - 14),
  }));
}

/** main's card chart, drawn from the dashboard's real numbers. Hover or focus a bar, point or slice to read it. */
function PreviewChart({ kind, series, labels = [] }: { kind: "line" | "area" | "bar" | "donut"; series: number[]; labels?: string[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = series.reduce((sum, value) => sum + value, 0) || 1;
  const name = (index: number) => labels[index] ?? `Value ${index + 1}`;
  const reading = (index: number) => kind === "donut" ? `${name(index)}: ${shorten(series[index])} (${Math.round((series[index] / total) * 100)}%)` : `${name(index)}: ${shorten(series[index])}`;
  const hit = (index: number) => ({ tabIndex: 0, role: "img" as const, "aria-label": reading(index), onMouseEnter: () => setActive(index), onFocus: () => setActive(index), onMouseLeave: () => setActive(null), onBlur: () => setActive(null) });
  const tones = ["var(--sage)", "var(--slate)", "var(--muted-foreground)", "var(--border-strong)", "#a99bd0", "#d4b483"];
  let body: React.ReactNode;

  if (kind === "donut") {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const shown = series.slice(0, 3);
    body = (
      <div className="flex h-full items-center gap-4 px-1">
        <svg viewBox="0 0 72 72" className="size-16 shrink-0 -rotate-90" aria-hidden="true">
          {shown.map((value, index) => {
            const length = (value / total) * circumference;
            const segment = <circle key={index} cx="36" cy="36" r={radius} fill="none" stroke={tones[index % tones.length]} strokeWidth="9" strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`} strokeDashoffset={-offset} opacity={active === null || active === index ? 1 : 0.35} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} />;
            offset += length;
            return segment;
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-1">
          {shown.map((value, index) => (
            <div key={index} {...hit(index)} className={cn("flex items-center gap-2 rounded focus-visible:outline-none", active !== null && active !== index && "opacity-40")}>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: tones[index % tones.length] }} />
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{name(index)}</span>
              <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-raised"><span className="block h-1 rounded-full" style={{ width: `${(value / total) * 100}%`, background: tones[index % tones.length] }} /></span>
              <span className="w-7 text-right text-[10px] tabular-nums text-foreground/80">{Math.round((value / total) * 100)}%</span>
            </div>
          ))}
          {series.length > shown.length ? <p className="pl-3.5 text-[10px] text-muted-foreground">+{series.length - shown.length} more</p> : null}
        </div>
      </div>
    );
  } else if (kind === "bar") {
    const max = Math.max(...series, 1);
    const top = series.indexOf(Math.max(...series));
    body = (
      <div className="flex h-full flex-col gap-0.5 px-1">
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {series.map((value, index) => (
            <span key={index} {...hit(index)} className="flex-1 rounded-[2px] focus-visible:outline-none" style={{ height: `${Math.max((value / max) * 100, 3)}%`, background: active === index || (active === null && index === top) ? "var(--sage)" : "var(--slate)", opacity: active === null ? (index === top ? 1 : 0.45) : active === index ? 1 : 0.35 }} />
          ))}
        </div>
        {labels.length ? <div aria-hidden="true" className="flex gap-1.5">{series.map((_, index) => <span key={index} className="min-w-0 flex-1 truncate text-center text-[9px] leading-3 text-muted-foreground">{name(index)}</span>)}</div> : null}
      </div>
    );
  } else {
    const points = toPoints(series);
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${line} L${chartWidth},${chartHeight} L0,${chartHeight} Z`;
    const marked = points[active ?? points.length - 1];
    const tone = kind === "area" ? "var(--sage)" : "var(--slate)";
    body = (
      <div className="flex h-full flex-col gap-0.5">
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={chartWidth} y1={chartHeight * ratio} y2={chartHeight * ratio} stroke="var(--border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          {kind === "area" && <path d={area} fill="var(--sage)" opacity="0.12" />}
          <path d={line} fill="none" stroke={tone} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden="true" className="pointer-events-none absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(marked.x / chartWidth) * 100}%`, top: `${(marked.y / chartHeight) * 100}%`, background: tone }} />
        <div className="absolute inset-0 flex">{series.map((_, index) => <span key={index} {...hit(index)} className="h-full flex-1 focus-visible:outline-none" />)}</div>
      </div>
      {labels.length ? <div aria-hidden="true" className="flex justify-between gap-2 text-[9px] leading-3 text-muted-foreground"><span className="truncate">{name(0)}</span><span className="truncate">{name(series.length - 1)} · {shorten(series[series.length - 1])}</span></div> : null}
      </div>
    );
  }
  return (
    <div className="relative h-full">
      {body}
      {active !== null ? <span className="pointer-events-none absolute right-0 top-0 z-10 max-w-full truncate rounded border bg-popover px-1.5 py-0.5 text-[10px] shadow-md">{reading(active)}</span> : null}
    </div>
  );
}

const KIND: Record<string, "line" | "area" | "bar" | "donut"> = { line: "line", area: "area", bar: "bar", hbar: "bar", histogram: "bar", pie: "donut" };

function DashboardCard({ dashboard, onTogglePin, onRename, onShare, onDelete, onDuplicate }: { dashboard: Dashboard; onTogglePin: (dashboard: Dashboard) => void; onRename: (dashboard: Dashboard) => void; onShare: (dashboard: Dashboard) => void; onDelete: (dashboard: Dashboard) => void; onDuplicate: (dashboard: Dashboard) => void }) {
  const router = useRouter();
  const { tiles } = dashboard.preview ?? { tiles: [] };
  const { headline, chart } = pickHighlights(tiles);
  const delta = dashboard.preview?.delta;
  const published = dashboard.status === "published";
  const kind = chart ? KIND[chart.type] : undefined;
  return (
    <article aria-label={dashboard.name} className="group flex flex-col rounded-lg border bg-surface/40 transition-colors hover:border-border-strong hover:bg-surface/70">
      <div onClick={() => router.push(`/dashboards/${dashboard.id}`)} className="relative cursor-pointer rounded-t-lg border-b bg-background/60 px-3.5 pb-2 pt-3">
        {headline ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{headline.title}</p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-foreground" title={`${headline.title}: ${headline.value}`}>{headline.value}</p>
            </div>
            {delta ? <span title={`${delta.label}: latest vs previous`} className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", delta.positive ? "text-sage" : "text-destructive")} style={{ background: `color-mix(in srgb, ${delta.positive ? "var(--sage)" : "var(--destructive)"} 12%, transparent)` }}>{delta.text}</span> : null}
          </div>
        ) : null}
        <div className={cn("h-16", headline && "mt-2")}>
          {chart && kind && chart.series ? <PreviewChart kind={kind} series={chart.series} labels={chart.labels} />
            : chart ? <MiniTile tile={{ ...chart, span: 1 }} bare={chart.type !== "gauge"} />
            : !headline ? <p className="grid h-full place-items-center rounded border border-dashed text-[11px] text-muted-foreground">No charts yet</p> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3.5 pb-2.5 pt-2.5">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={dashboard.name}>
            <Link href={`/dashboards/${dashboard.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{dashboard.name}</Link>
          </h2>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px]", published ? "border-emerald-400/30 text-emerald-300" : "text-muted-foreground")}>{published ? <><span className="size-1.5 rounded-full bg-emerald-400" />Live</> : "Draft"}</span>
          {dashboard.pinned && <Pin aria-label="Pinned" className="mt-1 size-3.5 shrink-0 fill-foreground text-foreground" />}
          <Menu dashboard={dashboard} onPin={() => onTogglePin(dashboard)} onRename={() => onRename(dashboard)} onShare={() => onShare(dashboard)} onDelete={() => onDelete(dashboard)} onDuplicate={() => onDuplicate(dashboard)} />
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2 text-[11px] text-muted-foreground">
          <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border bg-raised text-[9px] font-semibold text-foreground">{initials(dashboard.owner)}</span>
          <span className="truncate">{dashboard.owner}</span>
          {dashboard.ownership === "shared" && <span className="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px]"><Users className="size-2.5" />Shared</span>}
          <span className="ml-auto shrink-0 tabular-nums">{ago(dashboard.updated_at)}</span>
        </div>
      </div>
    </article>
  );
}

export function DashboardsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const list = useDashboards();
  const pin = usePinDashboard();
  const save = useSaveDashboard();
  const duplicate = useDuplicateDashboard();
  const remove = useDeleteDashboard();
  const [renaming, setRenaming] = useState<Dashboard | null>(null);
  const [newName, setNewName] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Dashboard | null>(null);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const shareTarget = all.find((item) => item.id === sharing) ?? null;

  const rename = () => {
    if (!renaming || !newName.trim()) return;
    save.mutate({ ...renaming, name: newName }, { onSuccess: () => setRenaming(null) });
  };

  const counts = useMemo<Record<Ownership, number>>(
    () => ({
      all: all.length,
      owned: all.filter((item) => item.ownership === "owned").length,
      shared: all.filter((item) => item.ownership === "shared").length,
      pinned: all.filter((item) => item.pinned).length,
    }),
    [all]
  );

  const dashboards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return all
      .filter((item) => (ownership === "all" ? true : ownership === "pinned" ? item.pinned : item.ownership === ownership))
      .filter(
        (item) =>
          !query ||
          item.name.toLocaleLowerCase().includes(query) ||
          item.owner.toLocaleLowerCase().includes(query) ||
          item.description.toLocaleLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        if (sort === "name_asc") return left.name.localeCompare(right.name);
        return sort === "updated_asc" ? left.updated_at.localeCompare(right.updated_at) : right.updated_at.localeCompare(left.updated_at);
      });
  }, [all, ownership, search, sort]);

  const isFiltered = Boolean(search) || ownership !== "all";

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Monitor key metrics, custom charts and analytics views.</p>
        </div>
        <Button asChild>
          <Link href="/dashboards/new"><Plus /> New Dashboard</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search dashboards</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dashboards..."
            className="h-9 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <div role="group" aria-label="Dashboard ownership" className="inline-flex h-9 rounded-md border bg-surface p-0.5">
          {ownershipOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={ownership === option.value}
              onClick={() => setOwnership(option.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                ownership === option.value && "bg-raised font-medium text-foreground"
              )}
            >
              {option.label}
              <span aria-hidden="true" className="text-[10px] tabular-nums text-muted-foreground">{counts[option.value]}</span>
            </button>
          ))}
        </div>

        <label className="relative ml-auto">
          <span className="sr-only">Sort dashboards</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-9 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-8 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong"
          >
            <option value="updated_desc">Last updated</option>
            <option value="updated_asc">Oldest updated</option>
            <option value="name_asc">Name</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </label>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground" aria-live="polite">
        {dashboards.length} {dashboards.length === 1 ? "dashboard" : "dashboards"}
        {isFiltered && " matching filters"}
      </p>

      {dashboards.length > 0 ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              onTogglePin={(item) => pin.mutate({ id: item.id, pinned: !item.pinned })}
              onRename={(item) => { setRenaming(item); setNewName(item.name); }}
              onShare={(item) => setSharing(item.id)}
              onDelete={setDeleting}
              onDuplicate={(item) => duplicate.mutate(item, { onSuccess: (copy) => router.push(`/dashboards/${copy.id}`) })}
            />
          ))}
        </div>
      ) : list.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading dashboards…</p>
      ) : list.isError ? (
        <div className="mt-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">Dashboards could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">Check that the backend is running, then try again.</p>
          <Button type="button" variant="ghost" className="mt-4" onClick={() => void list.refetch()}>Try again</Button>
        </div>
      ) : isFiltered ? (
        <div className="mt-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <LayoutDashboard className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">No matching dashboards</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters.</p>
          <Button type="button" variant="ghost" className="mt-4" onClick={() => { setSearch(""); setOwnership("all"); }}>Clear filters</Button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <LayoutDashboard className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">No dashboards yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Pick a dataset and describe what you want to see, or build one chart by chart.</p>
          <Button asChild className="mt-4"><Link href="/dashboards/new"><Plus /> New Dashboard</Link></Button>
        </div>
      )}

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm p-5">
          <DialogTitle className="text-sm font-semibold">Rename dashboard</DialogTitle>
          <DialogDescription className="sr-only">Give the dashboard a new name.</DialogDescription>
          <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); rename(); }}>
            <input aria-label="Dashboard name" autoFocus maxLength={160} value={newName} onChange={(event) => setNewName(event.target.value)} className="h-9 w-full rounded-md border bg-surface px-3 text-sm outline-none focus:border-border-strong" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim() || save.isPending}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm p-5">
          <DialogTitle className="text-sm font-semibold">Delete this dashboard?</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">“{deleting?.name}” will be removed for everyone it is shared with. The data files stay in your Library.</DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button type="button" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {shareTarget && (
        <ShareDialog
          open
          onOpenChange={(open) => !open && setSharing(null)}
          status={shareTarget.status}
          shares={shareTarget.shares ?? []}
          saving={save.isPending}
          onChange={(next) => save.mutate({ ...shareTarget, status: next.status, shares: next.shares })}
        />
      )}
    </section>
  );
}
