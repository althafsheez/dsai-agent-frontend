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
type PreviewKind = NonNullable<NonNullable<Dashboard["preview"]>["chart"]>["kind"];

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

function Menu({ dashboard, onRename, onShare, onDelete, onDuplicate }: { dashboard: Dashboard; onRename: () => void; onShare: () => void; onDelete: () => void; onDuplicate: () => void }) {
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
  const { kpi, chart } = dashboard.preview ?? { kpi: { label: "Widgets", value: String(dashboard.widgets.length) }, chart: null };
  return (
    <article aria-label={dashboard.name} className="group flex flex-col rounded-lg border bg-surface/40 transition-colors hover:border-border-strong hover:bg-surface/70">
      <Link href={`/dashboards/${dashboard.id}`} aria-label={`Open ${dashboard.name}`} className="relative block overflow-hidden rounded-t-lg border-b bg-background/60 px-4 pb-3 pt-3.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{kpi.label}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">{kpi.value}</p>
          </div>
          <span className="mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{dashboard.status === "published" ? "Published" : "Draft"}</span>
        </div>
        <div className="mt-3 h-[72px]">
          {chart ? <PreviewChart kind={chart.kind} series={chart.series} /> : <p className="grid h-full place-items-center rounded border border-dashed text-[11px] text-muted-foreground">No chart yet</p>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
        <div className="flex items-start gap-1">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={dashboard.name}>
            <Link href={`/dashboards/${dashboard.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{dashboard.name}</Link>
          </h2>
          <button
            type="button"
            aria-pressed={dashboard.pinned}
            aria-label={dashboard.pinned ? `Unpin ${dashboard.name}` : `Pin ${dashboard.name}`}
            title={dashboard.pinned ? "Unpin" : "Pin"}
            onClick={() => onTogglePin(dashboard)}
            className={cn(
              "-mt-0.5 grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              dashboard.pinned ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
          >
            <Pin className={cn("size-3.5", dashboard.pinned && "fill-foreground")} />
          </button>
          <Menu dashboard={dashboard} onRename={() => onRename(dashboard)} onShare={() => onShare(dashboard)} onDelete={() => onDelete(dashboard)} onDuplicate={() => onDuplicate(dashboard)} />
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
