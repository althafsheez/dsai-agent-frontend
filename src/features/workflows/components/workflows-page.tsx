"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Play, Plus, Search, Workflow as WorkflowIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeTrigger } from "../logic/generate-workflow";
import { formatDuration, formatWhen } from "../logic/run-view";
import { useRunViews, useStartRun, useWorkflowRuns, useWorkflows } from "../use-workflows";
import type { WorkflowState } from "../types";
import { RunsTable, StateBadge, StatusBadge, triggerIcon } from "./workflow-parts";

type Filter = "all" | WorkflowState;
type Tab = "workflows" | "runs";
const filters: Array<{ value: Filter; label: string }> = [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "draft", label: "Drafts" }];

export function WorkflowsPage() {
  const workflowsQuery = useWorkflows();
  const runsQuery = useWorkflowRuns();
  const startRun = useStartRun();
  const views = useRunViews(runsQuery.data);
  const [tab, setTab] = useState<Tab>("workflows");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const workflows = workflowsQuery.data ?? [];
  const lastRunByWorkflow = useMemo(() => {
    const map = new Map<string, (typeof views)[number]>();
    for (const view of views) if (!map.has(view.run.workflow_id)) map.set(view.run.workflow_id, view);
    return map;
  }, [views]);
  const running = views.filter((view) => view.status === "running");
  const query = search.trim().toLowerCase();
  const visible = workflows.filter((workflow) => (filter === "all" || workflow.state === filter) && (!query || `${workflow.name} ${workflow.description}`.toLowerCase().includes(query)));
  const visibleRuns = views.filter((view) => !query || view.run.workflow_name.toLowerCase().includes(query));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><WorkflowIcon className="size-5" strokeWidth={1.5} /></div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
              <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground" title="Workflows and runs are stored in this browser until a workflow API exists">Demo data</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Automate recurring analyses. Run on demand, on a schedule or when something happens.</p>
          </div>
        </div>
        <Button asChild><Link href="/workflows/new"><Plus />New workflow</Link></Button>
      </header>

      <section aria-label="Running now" className="mb-6">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Running now</h2>
        {running.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {running.map((view) => (
              <li key={view.run.id}>
                <Link href={`/workflows/${view.run.workflow_id}/runs/${view.run.id}`} className="block rounded-lg border bg-surface/60 p-3 transition-colors hover:border-border-strong">
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{view.run.workflow_name}</span><StatusBadge status="running" /></span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-sky-300 transition-[width] duration-700" style={{ width: `${Math.min(100, Math.round((view.elapsed_ms / view.total_ms) * 100))}%` }} /></span>
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">Started {formatWhen(view.run.started_at)} · {formatDuration(view.elapsed_ms)} elapsed</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-lg border border-dashed px-4 py-4 text-xs text-muted-foreground">Nothing is running. Start a workflow with its play button.</p>}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Workflows view" className="flex w-fit rounded-lg border bg-surface p-1">
          {([["workflows", `Workflows (${workflows.length})`], ["runs", `Runs (${views.length})`]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", tab === value && "bg-raised text-foreground shadow-sm")}>{label}</button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {tab === "workflows" ? (
            <div aria-label="Workflow status" className="flex h-8 overflow-x-auto rounded-md border bg-surface p-0.5">
              {filters.map((option) => (
                <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={cn("min-w-14 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground", filter === option.value && "bg-raised font-medium text-foreground")}>{option.label}</button>
              ))}
            </div>
          ) : null}
          <label className="relative block w-full min-w-0 sm:w-64">
            <span className="sr-only">Search workflows</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workflows…" className="h-9 w-full rounded-md border bg-surface pl-9 pr-8 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong" />
            {search ? <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button> : null}
          </label>
        </div>
      </div>

      <div className="mt-4">
        {tab === "runs" ? <RunsTable views={visibleRuns} empty={query ? "No runs match your search." : "No runs yet."} /> : visible.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="border-b bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Workflow</th><th className="px-3 py-2 font-medium">Trigger</th><th className="px-3 py-2 font-medium">Last run</th><th className="px-3 py-2 font-medium">Status</th><th className="w-12 px-3 py-2"><span className="sr-only">Run</span></th></tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((workflow) => {
                  const last = lastRunByWorkflow.get(workflow.id);
                  const TriggerIcon = triggerIcon[workflow.trigger.kind];
                  const isRunning = last?.status === "running";
                  return (
                    <tr key={workflow.id} className="hover:bg-surface/60">
                      <td className="max-w-[200px] px-3 py-3 lg:max-w-[280px]">
                        <Link href={`/workflows/${workflow.id}`} className="block truncate text-sm font-medium hover:underline">{workflow.name}</Link>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{workflow.description}</span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground"><span className="inline-flex items-center gap-1.5"><TriggerIcon className="size-3.5" /><span className="max-w-[130px] truncate lg:max-w-[220px]">{describeTrigger(workflow.trigger)}</span></span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{last ? formatWhen(last.run.started_at) : "Never"}</td>
                      <td className="px-3 py-3">{last ? <StatusBadge status={last.status} /> : <StateBadge state={workflow.state} />}</td>
                      <td className="px-3 py-3">
                        <button type="button" aria-label={`Run ${workflow.name} now`} title="Run now" disabled={isRunning || startRun.isPending} onClick={() => startRun.mutate(workflow.id)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-40"><Play className="size-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-14 text-center">
            <WorkflowIcon className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">{workflows.length ? "No matching workflows" : "No workflows yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{workflows.length ? "Try a different search or status filter." : "Create one by describing it or sketching it."}</p>
          </div>
        )}
      </div>
    </section>
  );
}
