"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, ChevronDown, Code2, Database, FileImage, FileSpreadsheet, FileText, Filter, Layers3, MoreHorizontal, Plus, Search, Sparkles, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LibraryTab = "all" | "reports" | "visuals" | "data" | "code";
type LibraryKind = Exclude<LibraryTab, "all">;
type Sort = "recent" | "oldest" | "name";

interface LibraryItem {
  id: string;
  name: string;
  description: string;
  kind: LibraryKind;
  date: string;
  rank: number;
  favorite: boolean;
  group: "popular" | "mine";
}

const libraryItems: LibraryItem[] = [
  { id: "sales-dashboard", name: "Sales Analytics Dashboard", description: "Track revenue, pipeline, and regional performance.", kind: "visuals", date: "Nov 7, 2026", rank: 1, favorite: true, group: "popular" },
  { id: "revenue-notebook", name: "Revenue Analysis.ipynb", description: "Notebook for recurring revenue and cohort analysis.", kind: "code", date: "Nov 5, 2026", rank: 2, favorite: false, group: "popular" },
  { id: "podman-report", name: "Podman Compose Setup Guide", description: "Saved PDF guide and deployment reference.", kind: "reports", date: "Oct 2, 2026", rank: 3, favorite: false, group: "popular" },
  { id: "customer-data", name: "Customer Data Workbook", description: "Cleaned customer attributes and account metrics.", kind: "data", date: "Sep 28, 2026", rank: 4, favorite: false, group: "popular" },
  { id: "cluster-image", name: "Cluster Visualization", description: "Generated customer segmentation scatter plot.", kind: "visuals", date: "Sep 28, 2026", rank: 5, favorite: true, group: "popular" },
  { id: "segmentation-code", name: "Image Segmentation.py", description: "Reusable OpenCV segmentation utility.", kind: "code", date: "Sep 28, 2026", rank: 6, favorite: false, group: "popular" },
  { id: "forecast-report", name: "FY25 Forecast Report", description: "Quarterly forecast assumptions and scenario summary.", kind: "reports", date: "Aug 14, 2026", rank: 7, favorite: true, group: "mine" },
  { id: "retention-data", name: "Retention Cohorts.csv", description: "Prepared cohort table for retention analysis.", kind: "data", date: "Aug 9, 2026", rank: 8, favorite: false, group: "mine" },
];

const tabs: Array<{ value: LibraryTab; label: string; icon: typeof Star }> = [
  { value: "all", label: "All", icon: Sparkles },
  { value: "reports", label: "Reports", icon: FileText },
  { value: "visuals", label: "Visuals", icon: BarChart3 },
  { value: "data", label: "Data", icon: Database },
  { value: "code", label: "Code", icon: Code2 },
];

function ItemIcon({ kind }: { kind: LibraryKind }) {
  if (kind === "visuals") return <BarChart3 className="size-5" />;
  if (kind === "reports") return <FileText className="size-5" />;
  if (kind === "data") return <FileSpreadsheet className="size-5" />;
  return <Code2 className="size-5" />;
}

function LibraryRow({ item, favorite, onFavorite }: { item: LibraryItem; favorite: boolean; onFavorite: () => void }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border bg-surface/55 p-3 transition-colors hover:border-border-strong hover:bg-surface">
    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-raised text-slate"><ItemIcon kind={item.kind} /></div>
    <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{item.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.date}</p></div>
    <button type="button" onClick={onFavorite} aria-label={`${favorite ? "Remove" : "Add"} ${item.name} ${favorite ? "from" : "to"} favorites`} aria-pressed={favorite} className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-muted-foreground hover:text-foreground"><Star className={cn("size-4", favorite && "fill-sage text-sage")} /></button>
    <button type="button" disabled title="Artifact actions are not connected yet" aria-label={`Actions for ${item.name}`} className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-lg bg-raised text-muted-foreground"><MoreHorizontal className="size-4" /></button>
  </article>;
}

export function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(libraryItems.filter((item) => item.favorite).map((item) => item.id)));
  const [showAddHelp, setShowAddHelp] = useState(false);

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return libraryItems
      .filter((item) => tab === "all" || item.kind === tab)
      .filter((item) => !favoritesOnly || favorites.has(item.id))
      .filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery) || item.description.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => sort === "name" ? left.name.localeCompare(right.name) : sort === "oldest" ? right.rank - left.rank : left.rank - right.rank);
  }, [favorites, favoritesOnly, query, sort, tab]);

  const popular = items.filter((item) => item.group === "popular");
  const mine = items.filter((item) => item.group === "mine");

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <header className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-raised"><Layers3 className="size-6" strokeWidth={1.5} /></div><div><div className="flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-tight">Library</h1><span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Preview</span></div><p className="mt-1 text-sm text-muted-foreground">Your reports, charts, files, and saved outputs in one place.</p></div></div>
      <Button type="button" className="h-10 px-4 text-sm" onClick={() => setShowAddHelp((current) => !current)} aria-expanded={showAddHelp}><Plus />Add</Button>
    </header>

    {showAddHelp && <div role="status" className="mt-4 rounded-md border bg-surface px-3 py-2 text-xs text-muted-foreground">Save an artifact from a chat’s context panel to add it here. Direct Library uploads are not connected yet.</div>}

    <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="tablist" aria-label="Library categories" className="flex max-w-full overflow-x-auto rounded-lg border bg-surface p-0.5">{tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm text-muted-foreground transition-colors hover:text-foreground", tab === value && "bg-raised text-foreground shadow-sm")}><Icon className="size-4" />{label}</button>)}</div>
      <div className="flex min-w-0 items-center gap-2">
        <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none"><span className="sr-only">Search library</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}</label>
        <button type="button" aria-label="Show favorites only" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((current) => !current)} className={cn("grid size-10 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground", favoritesOnly && "bg-raised text-sage")}><Filter className="size-4" /></button>
        <label className="relative grid size-10 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong"><span className="sr-only">Sort library</span><ChevronDown className="size-4" /><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="absolute inset-0 cursor-pointer appearance-none opacity-0"><option value="recent">Most recent</option><option value="oldest">Oldest</option><option value="name">Name</option></select></label>
      </div>
    </div>

    <section className="relative mt-7 overflow-hidden rounded-xl border border-slate/30 bg-[linear-gradient(120deg,#293547,#1b2636_55%,#172232)] px-7 py-7 sm:px-10 sm:py-8">
      <div className="relative z-10 max-w-xl"><p className="text-xs font-medium uppercase tracking-[0.12em] text-slate">Featured</p><h2 className="mt-2 text-2xl font-semibold">Revenue intelligence collection</h2><p className="mt-2 text-sm leading-relaxed text-foreground/75">A curated set of dashboards, reports, and prepared data for recurring revenue analysis.</p><Button type="button" className="mt-4" onClick={() => { setTab("all"); setQuery("revenue"); }}>View collection</Button></div>
      <div className="absolute -right-6 top-1/2 hidden -translate-y-1/2 items-end gap-4 opacity-80 sm:flex"><div className="relative h-28 w-24 rounded-[50%] border-2 border-slate/60 bg-slate/10 before:absolute before:inset-x-0 before:top-8 before:h-16 before:border-y-2 before:border-slate/50" /><div className="flex h-28 w-44 items-end justify-center gap-3 rounded-2xl border-2 border-slate/60 bg-slate/15 p-5 shadow-2xl">{[24, 44, 63, 86].map((height) => <span key={height} className="w-5 rounded-t bg-slate" style={{ height: `${height}%` }} />)}</div></div>
    </section>

    {items.length ? <div className="mt-8 space-y-9">
      {popular.length > 0 && <section aria-labelledby="popular-library"><div className="mb-3 flex items-center justify-between"><h2 id="popular-library" className="text-base font-semibold">Popular items</h2><button type="button" onClick={() => { setTab("all"); setQuery(""); }} className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-slate">Show all <ArrowRight className="size-3.5" /></button></div><div className="grid gap-3 lg:grid-cols-2">{popular.map((item) => <LibraryRow key={item.id} item={item} favorite={favorites.has(item.id)} onFavorite={() => toggleFavorite(item.id)} />)}</div></section>}
      {mine.length > 0 && <section aria-labelledby="your-library"><div className="mb-3 flex items-center justify-between"><h2 id="your-library" className="text-base font-semibold">Your library</h2><button type="button" onClick={() => { setTab("all"); setQuery(""); }} className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-slate">Show all <ArrowRight className="size-3.5" /></button></div><div className="grid gap-3 lg:grid-cols-2">{mine.map((item) => <LibraryRow key={item.id} item={item} favorite={favorites.has(item.id)} onFavorite={() => toggleFavorite(item.id)} />)}</div></section>}
    </div> : <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center"><FileImage className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching library items</p><p className="mt-1 text-xs text-muted-foreground">Try another category, search, or filter.</p><button type="button" onClick={() => { setTab("all"); setQuery(""); setFavoritesOnly(false); }} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button></div>}
  </section>;
}
