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
import { ago } from "./data-status";
import { ShareDialog } from "./share-dialog";

type Ownership = "all" | "owned" | "shared" | "pinned";
type Sort = "updated_desc" | "updated_asc" | "name_asc";
type PreviewChart = NonNullable<Dashboard["preview"]>["charts"][number];

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
const chartHeight = 84;
const tones = ["var(--sage)", "var(--slate)", "var(--muted-foreground)", "var(--border-strong)", "var(--raised)"];
const shorten = (value: number) => (Math.abs(value) >= 1e6 ? `${+(value / 1e6).toFixed(1)}M` : Math.abs(value) >= 1e4 ? `${+(value / 1e3).toFixed(1)}K` : `${+value.toFixed(1)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

/** A small chart for a card. Hover (or focus) a bar, point or slice to read its label and value. */
function MiniChart({ chart }: { chart: PreviewChart }) {
  const [active, setActive] = useState<number | null>(null);
  const { kind, series, labels } = chart;
  const max = Math.max(...series, 1);
  const min = Math.min(...series);
  const readout = active === null ? null : `${labels[active]}: ${shorten(series[active])}`;

  if (kind === "donut") {
    const total = series.reduce((sum, value) => sum + value, 0) || 1;
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
      <div className="flex h-full items-center gap-4 px-1">
        <svg viewBox="0 0 72 72" className="size-[78px] shrink-0 -rotate-90" role="img" aria-label={`${chart.title} share`}>
          {series.map((value, index) => {
            const length = (value / total) * circumference;
            const segment = (
              <circle key={index} cx="36" cy="36" r={radius} fill="none" stroke={tones[index % tones.length]} strokeWidth={active === index ? 12 : 9}
                strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`} strokeDashoffset={-offset} className="cursor-pointer transition-all"
                onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} />
            );
            offset += length;
            return segment;
          })}
        </svg>
        <ul className="min-w-0 flex-1 space-y-1">
          {series.map((value, index) => (
            <li key={index} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}
              className={cn("flex items-center gap-2 text-[10px] text-muted-foreground transition-colors", active === index && "text-foreground")}>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: tones[index % tones.length] }} />
              <span className="min-w-0 flex-1 truncate">{labels[index]}</span>
              <span className="tabular-nums">{Math.round((value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (kind === "bar") {
    return (
      <div className="relative flex h-full flex-col">
        <p className="h-4 truncate text-[10px] tabular-nums text-muted-foreground">{readout ?? chart.title}</p>
        <div className="flex flex-1 items-end gap-1" onMouseLeave={() => setActive(null)}>
          {series.map((value, index) => (
            <button key={index} type="button" aria-label={`${labels[index]}: ${shorten(value)}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}
              className="flex h-full flex-1 items-end focus-visible:outline-none">
              <span className="block w-full rounded-[2px] transition-opacity" style={{ height: `${Math.max((value / max) * 100, 4)}%`, background: active === index || (active === null && index === 0) ? "var(--sage)" : "var(--slate)", opacity: active === null || active === index ? 1 : 0.4 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const range = max - min || 1;
  const points = series.map((value, index) => ({ x: (index / Math.max(series.length - 1, 1)) * chartWidth, y: chartHeight - 8 - ((value - min) / range) * (chartHeight - 20) }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const tone = kind === "area" ? "var(--sage)" : "var(--slate)";
  const hovered = active === null ? points[points.length - 1] : points[active];
  return (
    <div className="flex h-full flex-col">
      <p className="h-4 truncate text-[10px] tabular-nums text-muted-foreground">{readout ?? chart.title}</p>
      <div className="relative flex-1">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight - 16}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={chart.title}>
          <g transform="translate(0,-8)">
            {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={chartWidth} y1={chartHeight * ratio} y2={chartHeight * ratio} stroke="var(--border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
            {kind === "area" && <path d={`${line} L${chartWidth},${chartHeight} L0,${chartHeight} Z`} fill={tone} opacity="0.14" />}
            <path d={line} fill="none" stroke={tone} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {active !== null && <line x1={hovered.x} x2={hovered.x} y1="0" y2={chartHeight} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" />}
            <circle cx={hovered.x} cy={hovered.y} r="3" fill={tone} />
          </g>
        </svg>
        <div className="absolute inset-0 flex" onMouseLeave={() => setActive(null)}>
          {series.map((value, index) => <button key={index} type="button" aria-label={`${labels[index]}: ${shorten(value)}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="h-full flex-1 focus-visible:outline-none" />)}
        </div>
      </div>
    </div>
  );
}

function Menu({ dashboard, onPin, onRename, onShare, onDelete, onDuplicate }: { dashboard: Dashboard; onPin: () => void; onRename: () => void; onShare: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const role = roleOf(dashboard);
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
      <button type="button" aria-label={`Actions for ${dashboard.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-20 w-44 rounded-md border bg-popover p-1 shadow-lg">
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

function DashboardCard({ dashboard, onTogglePin, onRename, onShare, onDelete, onDuplicate }: { dashboard: Dashboard; onTogglePin: (dashboard: Dashboard) => void; onRename: (dashboard: Dashboard) => void; onShare: (dashboard: Dashboard) => void; onDelete: (dashboard: Dashboard) => void; onDuplicate: (dashboard: Dashboard) => void }) {
  const { kpis, charts } = dashboard.preview ?? { kpis: [{ label: "Widgets", value: String(dashboard.widgets.length) }], charts: [] };
  const [shown, setShown] = useState(0);
  const chart = charts[Math.min(shown, charts.length - 1)];
  return (
    <article aria-label={dashboard.name} className="group flex flex-col rounded-lg border bg-surface/40 transition-colors hover:border-border-strong hover:bg-surface/70">
      <div className="rounded-t-lg border-b bg-background/60 px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-4">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="min-w-0" title={kpi.label}>
                <p className="whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">{kpi.value}</p>
                <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>
          <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{dashboard.status === "published" ? "Published" : "Draft"}</span>
        </div>
        <div className="mt-3 h-[88px]">
          {chart ? <MiniChart key={chart.kind + chart.title} chart={chart} /> : <p className="grid h-full place-items-center rounded border border-dashed text-[11px] text-muted-foreground">No chart yet</p>}
        </div>
        {charts.length > 1 && (
          <div role="group" aria-label={`Chart type for ${dashboard.name}`} className="mt-3 flex gap-1">
            {charts.map((item, index) => (
              <button key={item.kind} type="button" aria-pressed={index === shown} onClick={() => setShown(index)}
                className={cn("rounded px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground hover:text-foreground", index === shown && "bg-raised font-medium text-foreground")}>
                {item.kind === "donut" ? "Pie" : item.kind}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <div className="flex items-start gap-1">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={dashboard.name}>
            <Link href={`/dashboards/${dashboard.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{dashboard.name}</Link>
          </h2>
          {dashboard.pinned && <Pin aria-label="Pinned" className="mt-1 size-3.5 shrink-0 fill-foreground text-foreground" />}
          <Menu dashboard={dashboard} onPin={() => onTogglePin(dashboard)} onRename={() => onRename(dashboard)} onShare={() => onShare(dashboard)} onDelete={() => onDelete(dashboard)} onDuplicate={() => onDuplicate(dashboard)} />
        </div>
        <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{dashboard.description || "No description"}</p>

        <div className="mt-auto flex items-center gap-2 pt-3.5 text-[11px] text-muted-foreground">
          <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border bg-raised text-[9px] font-semibold text-foreground">{initials(dashboard.owner)}</span>
          <span className="truncate">{dashboard.owner}</span>
          {dashboard.ownership === "shared" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px]"><Users className="size-2.5" /> Shared</span>
          )}
          <span className="ml-auto shrink-0 tabular-nums">{dashboard.widgets.length} widgets · {ago(new Date(dashboard.updated_at).getTime(), Date.now())}</span>
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
