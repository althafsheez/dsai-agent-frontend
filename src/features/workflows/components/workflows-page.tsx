"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowRecordDto, WorkflowRunRecordDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSetWorkflowState, useWorkflowRuns, useWorkflows } from "../use-workflows";
import { RunsTable } from "./runs-table";
import { TemplateGallery } from "./template-gallery";
import { WorkflowCard } from "./workflow-card";

type Tab = "workflows" | "runs" | "templates";
const statusFilters = {
  all: "All",
  active: "Active",
  inactive: "Paused",
  draft: "Draft",
} satisfies Record<"all" | WorkflowRecordDto["state"], string>;
type StatusFilter = keyof typeof statusFilters;

export function WorkflowsPage() {
  const workflows = useWorkflows();
  const runsQuery = useWorkflowRuns();
  const setState = useSetWorkflowState();
  const [tab, setTab] = useState<Tab>("workflows");
  const [status, setStatus] = useState<StatusFilter>("all");
  const items = workflows.data ?? [];
  const visibleItems = status === "all" ? items : items.filter((workflow) => workflow.state === status);
  const runs = [...(runsQuery.data ?? [])].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const latestRuns = new Map<string, WorkflowRunRecordDto>();
  for (const run of runs) {
    if (!latestRuns.has(run.workflow_id)) latestRuns.set(run.workflow_id, run);
  }
  const running = runs.filter((run) => run.status === "running").length;

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><WorkflowIcon className="size-5" strokeWidth={1.5} /></div>
          <h1 className="self-center text-xl font-semibold tracking-tight">Workflows</h1>
        </div>
        <Button asChild><Link href="/workflows/new"><Plus />New workflow</Link></Button>
      </header>

      <div role="tablist" aria-label="Workflows view" className="flex w-fit rounded-lg border bg-surface p-1">
        {([["workflows", `Saved workflows (${items.length})`], ["runs", `Runs${running ? ` · ${running} running` : ""}`], ["templates", "Templates"]] as const).map(([value, label]) => (
          <button key={value} id={`workflow-tab-${value}`} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground", tab === value && "bg-raised text-foreground shadow-sm")}>{label}</button>
        ))}
      </div>

      {tab === "runs" ? (
        <div className="mt-4 grid gap-5">
          {runs.length > 0 && (
            <RunsTable runs={runs} labelledBy="workflow-tab-runs" workflowNames={new Map(items.map((workflow) => [workflow.id, workflow.name]))} />
          )}
          {runsQuery.isError ? <p role="alert" className="text-xs text-rose-300">Could not load runs.</p> : null}
          {runsQuery.isLoading ? <p className="text-xs text-muted-foreground">Loading runs…</p> : null}
          {runsQuery.isSuccess && !runs.length ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">No runs yet. Runs from schedules and from “Run now” appear here.</p>
          ) : null}
        </div>
      ) : tab === "templates" ? (
        <div className="mt-4"><TemplateGallery /></div>
      ) : (
        <div className="mt-4">
          <div role="group" aria-label="Filter by workflow status" className="mb-4 flex w-fit rounded-md border bg-surface p-0.5">
            {(Object.keys(statusFilters) as StatusFilter[]).map((value) => (
              <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
                className={cn("h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", status === value && "bg-raised font-medium text-foreground")}>
                {statusFilters[value]}
              </button>
            ))}
          </div>
          {setState.isError && <p role="alert" className="mb-3 text-xs text-destructive">{setState.error.message || "Could not update workflow status."}</p>}
          {visibleItems.length ? (
            <ul aria-label="Saved workflows" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} lastRun={latestRuns.get(workflow.id)}
                  runsLoaded={runsQuery.isSuccess} statePending={setState.isPending}
                  onToggleState={() => setState.mutate({ id: workflow.id, state: workflow.state === "active" ? "inactive" : "active" })} />
              ))}
            </ul>
          ) : workflows.isLoading ? <p className="text-xs text-muted-foreground">Loading workflows…</p> : workflows.isError ? (
            <p role="alert" className="text-xs text-destructive">Could not load workflows.</p>
          ) : (
            <div className="rounded-lg border border-dashed px-6 py-10 text-center"><p className="text-sm font-medium">{status === "all" ? "No saved workflows yet" : `No ${statusFilters[status].toLowerCase()} workflows`}</p></div>
          )}
        </div>
      )}
    </section>
  );
}
