"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LayoutDashboard, MoreHorizontal, Pin, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listDashboards } from "../data/dashboard-store";
import type { Dashboard } from "../types";

type Ownership = "all" | "owned" | "shared" | "pinned";
type Sort = "updated_desc" | "updated_asc" | "name_asc";
type PreviewKind = "line" | "bar" | "area" | "donut";

interface DashboardPreview {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownership: "owned" | "shared";
  updated: string;
  updatedRank: number;
  widgets: number;
  pinned: boolean;
  preview: PreviewKind;
  series: number[];
  kpi: { label: string; value: string; delta: string; positive: boolean };
}

const dashboardPreviews: DashboardPreview[] = [
  { id: "revenue-overview", name: "Revenue Overview", description: "Monthly recurring revenue, expansion and churn by segment.", owner: "You", ownership: "owned", updated: "2h ago", updatedRank: 1, widgets: 8, pinned: true, preview: "area", series: [32, 38, 35, 44, 48, 46, 55, 61, 58, 66, 72, 78], kpi: { label: "MRR", value: "$1.24M", delta: "+8.2%", positive: true } },
  { id: "customer-health", name: "Customer Health", description: "Account health scores, NPS trends and at-risk customers.", owner: "You", ownership: "owned", updated: "1d ago", updatedRank: 2, widgets: 6, pinned: false, preview: "line", series: [62, 64, 61, 66, 63, 68, 70, 67, 71, 73, 72, 75], kpi: { label: "Avg. health", value: "72", delta: "+3 pts", positive: true } },
  { id: "sales-performance", name: "Sales Performance", description: "Pipeline coverage, win rate and rep quota attainment.", owner: "Alex Morgan", ownership: "shared", updated: "3d ago", updatedRank: 3, widgets: 10, pinned: true, preview: "bar", series: [40, 55, 48, 62, 58, 70, 66, 74], kpi: { label: "Win rate", value: "31.4%", delta: "+2.1%", positive: true } },
  { id: "marketing-attribution", name: "Marketing Attribution", description: "Channel contribution to pipeline across the funnel.", owner: "Sarah Chen", ownership: "shared", updated: "5d ago", updatedRank: 4, widgets: 7, pinned: false, preview: "donut", series: [42, 26, 18, 14], kpi: { label: "Sourced pipeline", value: "$3.8M", delta: "-4.6%", positive: false } },
  { id: "executive-summary", name: "Executive Summary", description: "Company-level KPIs for the weekly leadership review.", owner: "You", ownership: "owned", updated: "6d ago", updatedRank: 5, widgets: 12, pinned: false, preview: "line", series: [50, 52, 55, 53, 58, 60, 59, 64, 66, 65, 69, 71], kpi: { label: "ARR", value: "$14.9M", delta: "+12%", positive: true } },
  { id: "product-adoption", name: "Product Adoption", description: "Feature activation, weekly active users and retention cohorts.", owner: "You", ownership: "owned", updated: "1w ago", updatedRank: 6, widgets: 9, pinned: false, preview: "bar", series: [22, 30, 34, 41, 39, 47, 52, 58], kpi: { label: "WAU", value: "18.2K", delta: "+5.4%", positive: true } },
  { id: "support-operations", name: "Support Operations", description: "Ticket volume, first response time and resolution SLAs.", owner: "Priya Nair", ownership: "shared", updated: "1w ago", updatedRank: 7, widgets: 5, pinned: false, preview: "area", series: [70, 64, 68, 60, 57, 59, 52, 49, 51, 46, 44, 41], kpi: { label: "First response", value: "1.8h", delta: "-22%", positive: true } },
  { id: "finance-forecast", name: "Finance Forecast", description: "Cash runway, burn multiple and quarterly plan versus actuals.", owner: "You", ownership: "owned", updated: "2w ago", updatedRank: 8, widgets: 6, pinned: false, preview: "line", series: [80, 77, 75, 74, 70, 68, 67, 63, 61, 60, 57, 55], kpi: { label: "Runway", value: "26 mo", delta: "-1 mo", positive: false } },
  { id: "inventory-supply", name: "Inventory & Supply", description: "Stock levels, reorder alerts and supplier lead times.", owner: "Daniel Ortiz", ownership: "shared", updated: "3w ago", updatedRank: 9, widgets: 8, pinned: false, preview: "donut", series: [48, 30, 22], kpi: { label: "In stock", value: "94.1%", delta: "+0.8%", positive: true } },
];

const ownershipOptions: Array<{ value: Ownership; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "shared", label: "Shared" },
  { value: "pinned", label: "Pinned" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

function PreviewChart({ kind, series }: { kind: PreviewKind; series: number[] }) {
  if (kind === "donut") {
    const total = series.reduce((sum, value) => sum + value, 0);
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const tones = ["var(--sage)", "var(--slate)", "var(--muted-foreground)", "var(--border-strong)"];
    let offset = 0;
    return (
      <div className="flex h-full items-center gap-5 px-1">
        <svg viewBox="0 0 72 72" className="size-[72px] shrink-0 -rotate-90" aria-hidden="true">
          {series.map((value, index) => {
            const length = (value / total) * circumference;
            const segment = (
              <circle
                key={index}
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                stroke={tones[index % tones.length]}
                strokeWidth="9"
                strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return segment;
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-1.5">
          {series.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: tones[index % tones.length] }} />
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
                <span className="block h-1 rounded-full" style={{ width: `${(value / total) * 100}%`, background: tones[index % tones.length] }} />
              </span>
              <span className="w-7 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round((value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "bar") {
    const max = Math.max(...series);
    return (
      <div className="flex h-full items-end gap-1.5 px-1">
        {series.map((value, index) => (
          <span
            key={index}
            className="flex-1 rounded-[2px]"
            style={{
              height: `${(value / max) * 100}%`,
              background: index === series.length - 1 ? "var(--sage)" : "var(--slate)",
              opacity: index === series.length - 1 ? 1 : 0.45,
            }}
          />
        ))}
      </div>
    );
  }

  const points = toPoints(series);
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${chartWidth},${chartHeight} L0,${chartHeight} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} x1="0" x2={chartWidth} y1={chartHeight * ratio} y2={chartHeight * ratio} stroke="var(--border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ))}
      {kind === "area" && <path d={area} fill="var(--sage)" opacity="0.12" />}
      <path d={line} fill="none" stroke={kind === "area" ? "var(--sage)" : "var(--slate)"} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="2.5" fill={kind === "area" ? "var(--sage)" : "var(--slate)"} />
    </svg>
  );
}

function DashboardCard({ dashboard, onTogglePin }: { dashboard: DashboardPreview; onTogglePin: (id: string) => void }) {
  return (
    <article
      aria-label={dashboard.name}
      className="group flex flex-col overflow-hidden rounded-lg border bg-surface/40 transition-colors hover:border-border-strong hover:bg-surface/70"
    >
      <div className="relative border-b bg-background/60 px-4 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{dashboard.kpi.label}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">{dashboard.kpi.value}</p>
          </div>
          <span
            className={cn(
              "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              dashboard.kpi.positive ? "text-sage" : "text-destructive"
            )}
            style={{
              background: `color-mix(in srgb, ${dashboard.kpi.positive ? "var(--sage)" : "var(--destructive)"} 12%, transparent)`,
            }}
          >
            {dashboard.kpi.delta}
          </span>
        </div>
        <div className="mt-3 h-[72px]">
          <PreviewChart kind={dashboard.preview} series={dashboard.series} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={dashboard.name}>
            <Link href={`/dashboards/${dashboard.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{dashboard.name}</Link>
          </h2>
          <button
            type="button"
            aria-pressed={dashboard.pinned}
            aria-label={dashboard.pinned ? `Unpin ${dashboard.name}` : `Pin ${dashboard.name}`}
            title={dashboard.pinned ? "Unpin" : "Pin"}
            onClick={() => onTogglePin(dashboard.id)}
            className={cn(
              "-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              dashboard.pinned ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
          >
            <Pin className={cn("size-3.5", dashboard.pinned && "fill-foreground")} />
          </button>
          <button
            type="button"
            disabled
            title="Dashboard actions are planned for a future release"
            aria-label={`Actions for ${dashboard.name}`}
            className="-mr-1.5 -mt-0.5 grid size-7 shrink-0 cursor-not-allowed place-items-center rounded-md text-muted-foreground opacity-60"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{dashboard.description}</p>

        <div className="mt-auto flex items-center gap-2 pt-3.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-full border bg-raised text-[9px] font-semibold text-foreground"
          >
            {initials(dashboard.owner)}
          </span>
          <span className="truncate">{dashboard.owner}</span>
          {dashboard.ownership === "shared" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px]">
              <Users className="size-2.5" />
              Shared
            </span>
          )}
          <span className="ml-auto shrink-0 tabular-nums">
            {dashboard.widgets} widgets · {dashboard.updated}
          </span>
        </div>
      </div>
    </article>
  );
}

function fromStored(item: Dashboard): DashboardPreview {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(item.updated_at).getTime()) / 60_000));
  const updated = minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
  return {
    id: item.id, name: item.name, description: item.description || "Custom dashboard", owner: item.owner, ownership: item.ownership,
    updated, updatedRank: 0, widgets: item.widgets.length, pinned: item.pinned, preview: "bar",
    series: [22, 34, 28, 44, 38, 52, 47, 60],
    kpi: { label: "Widgets", value: String(item.widgets.length), delta: item.status === "published" ? "Published" : "Draft", positive: item.status === "published" },
  };
}

export function DashboardsPage() {
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [pinnedIds, setPinnedIds] = useState(() => new Set(dashboardPreviews.filter((item) => item.pinned).map((item) => item.id)));

  const togglePin = (id: string) =>
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [created, setCreated] = useState<DashboardPreview[]>([]);
  useEffect(() => {
    let active = true;
    void listDashboards().then((items) => {
      if (!active) return;
      const known = new Set(dashboardPreviews.map((item) => item.id));
      setCreated(items.filter((item) => !known.has(item.id)).map(fromStored));
    });
    return () => { active = false; };
  }, []);

  const all = useMemo(() => [...created, ...dashboardPreviews].map((item) => ({ ...item, pinned: pinnedIds.has(item.id) || item.pinned })), [created, pinnedIds]);

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
        return sort === "updated_asc" ? right.updatedRank - left.updatedRank : left.updatedRank - right.updatedRank;
      });
  }, [all, ownership, search, sort]);

  const isFiltered = Boolean(search) || ownership !== "all";

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
            <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Preview</span>
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
            <DashboardCard key={dashboard.id} dashboard={dashboard} onTogglePin={togglePin} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <LayoutDashboard className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">No matching dashboards</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters.</p>
          <Button
            type="button"
            variant="ghost"
            className="mt-4"
            onClick={() => {
              setSearch("");
              setOwnership("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}
