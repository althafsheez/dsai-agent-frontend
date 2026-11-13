"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  Database,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  HardDrive,
  Layers3,
  Mail,
  NotebookTabs,
  PanelsTopLeft,
  Play,
  Plug,
  Plus,
  Search,
  Snowflake,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectorCategory = "all" | "skill" | "data" | "app";
type Sort = "popular" | "name";

interface ConnectorPreview {
  id: string;
  name: string;
  description: string;
  category: Exclude<ConnectorCategory, "all">;
  group: "popular" | "yours";
  icon: typeof Plug;
  rank: number;
}

const connectorPreviews: ConnectorPreview[] = [
  { id: "data-cleaning", name: "Data Cleaning", description: "Clean, transform, and prepare messy datasets.", category: "skill", group: "popular", icon: Sparkles, rank: 1 },
  { id: "snowflake", name: "Snowflake", description: "Connect to your Snowflake warehouse and run analysis.", category: "data", group: "popular", icon: Snowflake, rank: 2 },
  { id: "gmail", name: "Gmail", description: "Read emails and prepare automated reports.", category: "app", group: "popular", icon: Mail, rank: 3 },
  { id: "postgresql", name: "PostgreSQL", description: "Query and analyze data from your database.", category: "data", group: "popular", icon: Database, rank: 4 },
  { id: "notion", name: "Notion", description: "Create reports and manage documentation.", category: "app", group: "popular", icon: NotebookTabs, rank: 5 },
  { id: "jira", name: "Jira", description: "Turn insights into tasks and track issues.", category: "app", group: "popular", icon: PanelsTopLeft, rank: 6 },
  { id: "data-visualization", name: "Data Visualization", description: "Create charts and interactive visuals from your data.", category: "skill", group: "yours", icon: BarChart3, rank: 7 },
  { id: "google-drive", name: "Google Drive", description: "Access and analyze files stored in Drive.", category: "data", group: "yours", icon: HardDrive, rank: 8 },
];

const tabs: Array<{ value: ConnectorCategory; label: string; icon: typeof Plug }> = [
  { value: "all", label: "All", icon: Sparkles },
  { value: "skill", label: "Skills", icon: GraduationCap },
  { value: "data", label: "Data Sources", icon: Database },
  { value: "app", label: "Apps & Tools", icon: Wrench },
];

function categoryLabel(category: ConnectorPreview["category"]) {
  if (category === "skill") return "Skill";
  if (category === "data") return "Data Source";
  return "App";
}

function ConnectorRow({ connector }: { connector: ConnectorPreview }) {
  const Icon = connector.icon;
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border bg-surface/55 p-3 transition-colors hover:border-border-strong hover:bg-surface">
    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-raised text-foreground"><Icon className="size-6" strokeWidth={1.6} /></div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2"><h3 className="truncate text-sm font-medium">{connector.name}</h3><span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] text-muted-foreground">{categoryLabel(connector.category)}</span></div>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{connector.description}</p>
    </div>
    <button type="button" disabled title={`${connector.name} is coming soon`} className="hidden h-9 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-raised px-3 text-xs text-muted-foreground opacity-70 sm:flex"><Play className="size-3.5" />Try</button>
    <button type="button" disabled title={`${connector.name} is coming soon`} aria-label={`Add ${connector.name} — coming soon`} className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-lg bg-raised text-muted-foreground opacity-70"><Plus className="size-4" /></button>
  </article>;
}

export function ConnectorsPage() {
  const [category, setCategory] = useState<ConnectorCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [dataOnly, setDataOnly] = useState(false);
  const [showAddHelp, setShowAddHelp] = useState(false);

  const connectors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return connectorPreviews
      .filter((connector) => category === "all" || connector.category === category)
      .filter((connector) => !dataOnly || connector.category === "data")
      .filter((connector) => !normalizedQuery || connector.name.toLocaleLowerCase().includes(normalizedQuery) || connector.description.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => sort === "name" ? left.name.localeCompare(right.name) : left.rank - right.rank);
  }, [category, dataOnly, query, sort]);

  const popular = connectors.filter((connector) => connector.group === "popular");
  const yours = connectors.filter((connector) => connector.group === "yours");

  return <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <header className="flex items-start gap-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-raised"><Layers3 className="size-6" strokeWidth={1.5} /></div>
      <div><div className="flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-tight">Connectors</h1><span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Preview</span></div><p className="mt-1 text-sm text-muted-foreground">Extend Atelier AI with skills, data sources, and apps.</p></div>
    </header>

    {showAddHelp && <div role="status" className="mt-4 rounded-md border bg-surface px-3 py-2 text-xs text-muted-foreground">External connectors are coming soon. Local file selection is available when starting an analysis; direct connector installation is not connected yet.</div>}

    <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="tablist" aria-label="Connector categories" className="flex max-w-full overflow-x-auto rounded-lg border bg-surface p-0.5">{tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => setCategory(value)} className={cn("flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm text-muted-foreground transition-colors hover:text-foreground", category === value && "bg-raised text-foreground shadow-sm")}><Icon className="size-4" />{label}</button>)}</div>
      <div className="flex min-w-0 items-center gap-2">
        <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none"><span className="sr-only">Search connectors</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connectors..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}</label>
        <button type="button" aria-label="Show data sources only" aria-pressed={dataOnly} onClick={() => setDataOnly((current) => !current)} className={cn("grid size-10 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground", dataOnly && "bg-raised text-slate")}><Filter className="size-4" /></button>
        <label className="relative grid size-10 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong"><span className="sr-only">Sort connectors</span><ArrowDownUp className="size-4" /><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="absolute inset-0 cursor-pointer appearance-none opacity-0"><option value="popular">Popular</option><option value="name">Name</option></select></label>
        <Button type="button" className="h-10 px-4 text-sm" onClick={() => setShowAddHelp((current) => !current)} aria-expanded={showAddHelp}><Plus />Add</Button>
      </div>
    </div>

    {/* Featured banner is intentionally hidden for now.
    <section className="relative mt-7 overflow-hidden rounded-xl border border-slate/30 bg-[linear-gradient(120deg,#293547,#1b2636_55%,#172232)] px-7 py-7 sm:px-10 sm:py-8">
      <div className="relative z-10 max-w-xl"><p className="text-xs font-medium uppercase tracking-[0.12em] text-slate">Featured</p><h2 className="mt-2 text-2xl font-semibold">Data Analysis</h2><p className="mt-2 text-sm leading-relaxed text-foreground/75">Analyze, explore, and visualize your data with prepared skills, data sources, and productivity apps.</p><Button type="button" className="mt-4" onClick={() => setShowAddHelp(true)}>Add</Button></div>
      <div className="absolute -right-6 top-1/2 hidden -translate-y-1/2 items-end gap-4 opacity-80 sm:flex"><div className="relative h-28 w-24 rounded-[50%] border-2 border-slate/60 bg-slate/10 before:absolute before:inset-x-0 before:top-8 before:h-16 before:border-y-2 before:border-slate/50" /><div className="flex h-28 w-44 items-end justify-center gap-3 rounded-2xl border-2 border-slate/60 bg-slate/15 p-5 shadow-2xl">{[24, 44, 63, 86].map((height) => <span key={height} className="w-5 rounded-t bg-slate" style={{ height: `${height}%` }} />)}</div></div>
    </section>
    */}

    {connectors.length ? <div className="mt-8 space-y-9">
      {popular.length > 0 && <section aria-labelledby="popular-connectors"><div className="mb-3 flex items-center justify-between"><h2 id="popular-connectors" className="text-base font-semibold">Popular connectors</h2><button type="button" onClick={() => { setCategory("all"); setQuery(""); setDataOnly(false); }} className="flex items-center gap-2 text-xs font-medium hover:text-slate">Show all <ArrowRight className="size-3.5" /></button></div><div className="grid gap-3 lg:grid-cols-2">{popular.map((connector) => <ConnectorRow key={connector.id} connector={connector} />)}</div></section>}
      {yours.length > 0 && <section aria-labelledby="your-connectors"><div className="mb-3 flex items-center justify-between"><h2 id="your-connectors" className="text-base font-semibold">Your connectors</h2><button type="button" onClick={() => { setCategory("all"); setQuery(""); setDataOnly(false); }} className="flex items-center gap-2 text-xs font-medium hover:text-slate">Show all <ArrowRight className="size-3.5" /></button></div><div className="grid gap-3 lg:grid-cols-2">{yours.map((connector) => <ConnectorRow key={connector.id} connector={connector} />)}</div></section>}
    </div> : <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center"><FileSpreadsheet className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching connectors</p><p className="mt-1 text-xs text-muted-foreground">Try another category, search, or filter.</p><button type="button" onClick={() => { setCategory("all"); setQuery(""); setDataOnly(false); }} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button></div>}
  </section>;
}
