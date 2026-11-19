"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Database,
  FileText,
  Grid2X2,
  LayoutTemplate,
  List,
  Megaphone,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkflowCard, type WorkflowPreview, type WorkflowState } from "./workflow-card";

type Filter = "all" | WorkflowState;
type Sort = "updated_desc" | "updated_asc" | "name_asc";
type View = "grid" | "list";

const workflowPreviews: WorkflowPreview[] = [
  {
    id: "weekly-revenue",
    name: "Weekly Revenue Report",
    description: "Analyze revenue trends and send a summary to the team.",
    icon: BarChart3,
    source: { label: "Google Calendar", shortLabel: "31", tone: "bg-gradient-to-br from-blue-500 via-blue-500 to-emerald-500" },
    destination: { label: "Slack", shortLabel: "S", tone: "bg-gradient-to-br from-cyan-500 via-fuchsia-500 to-amber-400" },
    schedule: "Every Monday at 9:00 AM",
    trigger: "schedule",
    state: "active",
    lastRun: "2h ago",
    updatedRank: 1,
  },
  {
    id: "customer-churn",
    name: "Customer Churn Monitor",
    description: "Detect churn risks and notify the customer success team.",
    icon: Users,
    source: { label: "Snowflake", shortLabel: "SF", tone: "bg-sky-500" },
    destination: { label: "Slack", shortLabel: "S", tone: "bg-gradient-to-br from-cyan-500 via-fuchsia-500 to-amber-400" },
    schedule: "When new data is available",
    trigger: "event",
    state: "active",
    lastRun: "5h ago",
    updatedRank: 2,
  },
  {
    id: "sales-refresh",
    name: "Sales Data Refresh",
    description: "Refresh key sales metrics for your dashboards.",
    icon: Database,
    source: { label: "PostgreSQL", shortLabel: "PG", tone: "bg-blue-700" },
    destination: { label: "Tableau", shortLabel: "TB", tone: "bg-gradient-to-br from-blue-500 to-orange-400" },
    schedule: "Daily at 6:00 AM",
    trigger: "schedule",
    state: "active",
    lastRun: "Yesterday",
    updatedRank: 3,
  },
  {
    id: "marketing-performance",
    name: "Marketing Performance Update",
    description: "Analyze campaign performance and share results.",
    icon: Megaphone,
    source: { label: "Google Ads", shortLabel: "Ads", tone: "bg-gradient-to-br from-blue-500 via-emerald-500 to-amber-400" },
    destination: { label: "Gmail", shortLabel: "M", tone: "bg-gradient-to-br from-blue-500 via-red-500 to-amber-400" },
    schedule: "Every Friday at 4:00 PM",
    trigger: "schedule",
    state: "active",
    lastRun: "Nov 10, 4:02 PM",
    updatedRank: 4,
  },
  {
    id: "issue-triage",
    name: "Issue Triage Report",
    description: "Summarize new issues and highlight priority items.",
    icon: LayoutTemplate,
    source: { label: "Jira", shortLabel: "J", tone: "bg-blue-600" },
    destination: { label: "Notion", shortLabel: "N", tone: "bg-neutral-800" },
    schedule: "When a new issue is created",
    trigger: "event",
    state: "draft",
    lastRun: "Not run yet",
    updatedRank: 5,
  },
  {
    id: "executive-summary",
    name: "Executive Summary (Monthly)",
    description: "Generate a monthly business summary and email it.",
    icon: FileText,
    source: { label: "Google Calendar", shortLabel: "31", tone: "bg-gradient-to-br from-blue-500 via-blue-500 to-emerald-500" },
    destination: { label: "Gmail", shortLabel: "M", tone: "bg-gradient-to-br from-blue-500 via-red-500 to-amber-400" },
    schedule: "First day of every month",
    trigger: "schedule",
    state: "inactive",
    lastRun: "Last run: Oct 1",
    updatedRank: 6,
  },
];

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "draft", label: "Drafts" },
];

export function WorkflowsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [view, setView] = useState<View>("grid");

  const workflows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workflowPreviews
      .filter((workflow) => filter === "all" || workflow.state === filter)
      .filter((workflow) =>
        !query ||
        `${workflow.name} ${workflow.description} ${workflow.source.label} ${workflow.destination.label}`
          .toLocaleLowerCase()
          .includes(query)
      )
      .sort((left, right) =>
        sort === "name_asc"
          ? left.name.localeCompare(right.name)
          : sort === "updated_asc"
            ? right.updatedRank - left.updatedRank
            : left.updatedRank - right.updatedRank
      );
  }, [filter, search, sort]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate">
            <LayoutTemplate className="size-5" strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
              <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Automate analyses, scheduled reports, and multi-step data flows
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled
            title="Workflow templates are planned for a future release"
            className="disabled:opacity-70 text-xs h-9"
          >
            <Grid2X2 /> Browse templates
          </Button>
          <Button
            type="button"
            disabled
            title="Workflow creation is planned for a future release"
            className="disabled:opacity-80 text-xs h-9"
          >
            <Plus /> Create workflow
          </Button>
        </div>
      </header>

      <div className="relative mb-6 overflow-hidden rounded-xl border bg-surface/60 p-5 sm:p-6">
        <div className="relative z-10 max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">Get started</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Turn your analysis into automation.</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">
            Create workflows that run on a schedule, react to events, and keep your insights up to date.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 disabled:opacity-80 text-xs"
            disabled
            title="Workflow templates are planned for a future release"
          >
            Browse templates <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <div
          aria-hidden="true"
          className="mt-6 hidden items-center justify-end gap-3 lg:absolute lg:inset-y-0 lg:right-6 lg:mt-0 lg:flex"
        >
          {[CalendarDays, BarChart3, Bell].map((Icon, index) => (
            <div key={index} className="contents">
              <span className="grid size-12 place-items-center rounded-xl border bg-raised text-slate">
                <Icon className="size-5" strokeWidth={1.5} />
              </span>
              {index < 2 && <ArrowRight className="size-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search workflows</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workflows..."
            className="h-9 w-full rounded-md border bg-surface pl-9 pr-9 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong"
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

        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Workflow status" className="flex h-8 overflow-x-auto rounded-md border bg-surface p-0.5">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "min-w-14 rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  filter === option.value && "bg-raised text-foreground font-medium"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="relative">
            <span className="sr-only">Sort workflows</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-8 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-8 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong"
            >
              <option value="updated_desc">Sort: Last updated</option>
              <option value="updated_asc">Sort: Oldest updated</option>
              <option value="name_asc">Sort: Name</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </label>

          <div aria-label="Workflow view" className="flex rounded-md border bg-surface p-0.5">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={cn(
                "grid size-8 place-items-center rounded text-muted-foreground",
                view === "grid" && "bg-raised text-foreground"
              )}
            >
              <Grid2X2 className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "grid size-8 place-items-center rounded text-muted-foreground",
                view === "list" && "bg-raised text-foreground"
              )}
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {workflows.length ? (
        <div className={cn("mt-6 grid gap-3", view === "grid" ? "md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1")}>
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} list={view === "list"} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
          <LayoutTemplate className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">No matching workflows</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different search or status filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
            className="mt-4 text-xs font-medium text-slate hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
