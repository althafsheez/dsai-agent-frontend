"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Grid2X2, LayoutDashboard, List, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/features/workflows/logic/run-view";
import { useDashboards, useDeleteDashboard, useSaveDashboard } from "../use-dashboards";
import type { Dashboard } from "../types";

type Ownership = "all" | "owned" | "shared";
type Sort = "updated_desc" | "updated_asc" | "name_asc";
type View = "grid" | "list";

const ownershipOptions: Array<{ value: Ownership; label: string }> = [{ value: "all", label: "All" }, { value: "owned", label: "Owned" }, { value: "shared", label: "Shared" }];

export function DashboardsPage() {
  const dashboardsQuery = useDashboards();
  const save = useSaveDashboard();
  const remove = useDeleteDashboard();
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [view, setView] = useState<View>("grid");

  const dashboards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (dashboardsQuery.data ?? [])
      .filter((item) => ownership === "all" || item.ownership === ownership)
      .filter((item) => !query || item.name.toLocaleLowerCase().includes(query) || item.owner.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        if (sort === "name_asc") return left.name.localeCompare(right.name);
        const order = right.updated_at.localeCompare(left.updated_at);
        return sort === "updated_asc" ? -order : order;
      });
  }, [dashboardsQuery.data, ownership, search, sort]);

  const togglePin = (item: Dashboard) => save.mutate({ id: item.id, name: item.name, description: item.description, dataset_ids: item.dataset_ids, widgets: item.widgets, pinned: !item.pinned });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><LayoutDashboard className="size-5" strokeWidth={1.5} /></div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
              <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground" title="Dashboards are stored in this browser until a dashboards API exists">Demo data</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Monitor key metrics, custom charts, and analytics views</p>
          </div>
        </div>
        <Button asChild><Link href="/dashboards/new"><Plus />New Dashboard</Link></Button>
      </header>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search dashboards</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dashboards..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />
          {search ? <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Dashboard ownership" className="inline-flex h-8 rounded-md border bg-surface p-0.5">
            {ownershipOptions.map((option) => (
              <button key={option.value} type="button" aria-pressed={ownership === option.value} onClick={() => setOwnership(option.value)} className={cn("rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground", ownership === option.value && "bg-raised font-medium text-foreground")}>{option.label}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Sort dashboards</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-8 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-8 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong">
                <option value="updated_desc">Sort: Last updated</option>
                <option value="updated_asc">Sort: Oldest updated</option>
                <option value="name_asc">Sort: Name</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </label>
            <div className="inline-flex h-8 rounded-md border bg-surface p-0.5">
              {([["grid", Grid2X2, "Grid view"], ["list", List, "List view"]] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" aria-label={label} aria-pressed={view === value} onClick={() => setView(value)} className={cn("grid w-8 place-items-center rounded text-muted-foreground hover:text-foreground", view === value && "bg-raised text-foreground")}><Icon className="size-3.5" /></button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dashboards.length ? (
        <div className={cn("mt-6 grid gap-4", view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1")}>
          {dashboards.map((item) => (
            <article key={item.id} className={cn("group relative min-w-0 overflow-hidden rounded-xl border bg-background transition-colors hover:border-border-strong", view === "list" ? "flex items-center" : "flex flex-col")}>
              <Link href={`/dashboards/${item.id}`} aria-label={`Open ${item.name}`} className={cn("grid shrink-0 place-items-center bg-gradient-to-br from-sage/10 to-transparent", view === "list" ? "h-20 w-28" : "h-28")}>
                <LayoutDashboard className="size-9 text-sage/70" strokeWidth={1.25} />
              </Link>
              <div className="min-w-0 flex-1 p-3.5">
                <Link href={`/dashboards/${item.id}`} className="block truncate text-sm font-semibold tracking-tight hover:underline">{item.name}</Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>{item.owner}</span><span aria-hidden="true">·</span><span>{item.widgets.length} widget{item.widgets.length === 1 ? "" : "s"}</span><span aria-hidden="true">·</span><span>{formatWhen(item.updated_at)}</span>
                </p>
                <span className={cn("mt-2 inline-block rounded border px-1.5 py-0.5 text-[10px]", item.status === "published" ? "border-emerald-400/30 text-emerald-300" : "text-muted-foreground")}>{item.status === "published" ? "Published" : "Draft"}</span>
              </div>
              <div className={cn("flex gap-1 p-2", view === "grid" && "absolute right-1 top-1 rounded-md bg-background/80 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100")}>
                <button type="button" aria-label={item.pinned ? `Unpin ${item.name}` : `Pin ${item.name}`} onClick={() => togglePin(item)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground">{item.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}</button>
                {item.ownership === "owned" ? <button type="button" aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Delete “${item.name}”? This cannot be undone.`)) remove.mutate(item.id); }} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-red-300"><Trash2 className="size-3.5" /></button> : null}
              </div>
              {item.pinned ? <Pin aria-label="Pinned" className="absolute left-2 top-2 size-3.5 fill-foreground text-foreground" /> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
          <LayoutDashboard className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">{dashboardsQuery.isLoading ? "Loading dashboards…" : "No matching dashboards"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or ownership filter.</p>
        </div>
      )}
    </section>
  );
}
