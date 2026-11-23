"use client";

import Link from "next/link";
import { useState } from "react";
import { Play, Plus, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatWhen } from "../logic/format";
import { useRunNow, useSetWorkflowState, useWorkflowRuns, useWorkflows } from "../use-workflows";
import { StatusBadge } from "./flow-parts";
import { HistoryTable } from "./history-table";
import { TemplateGallery } from "./template-gallery";

type Tab = "workflows" | "history";

export function WorkflowsPage() {
  const workflows = useWorkflows();
  const runs = useWorkflowRuns();
  const runNow = useRunNow();
  const setState = useSetWorkflowState();
  const [tab, setTab] = useState<Tab>("workflows");
  const items = workflows.data ?? [];
  const history = runs.data ?? [];
  const lastRun = (id: string) => history.find((run) => run.workflow_id === id);
  const running = history.filter((run) => run.status === "running").length;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><WorkflowIcon className="size-5" strokeWidth={1.5} /></div>
          <div><h1 className="text-xl font-semibold tracking-tight">Workflows</h1><p className="mt-1 text-xs text-muted-foreground">Tasks that run by themselves on a schedule, with every run kept in the history.</p></div>
        </div>
        <Button asChild><Link href="/workflows/new"><Plus />New workflow</Link></Button>
      </header>

      <div role="tablist" aria-label="Workflows view" className="flex w-fit rounded-lg border bg-surface p-1">
        {([["workflows", `Workflows (${items.length})`], ["history", `History${running ? ` · ${running} running` : ""}`]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground", tab === value && "bg-raised text-foreground shadow-sm")}>{label}</button>
        ))}
      </div>

      {tab === "history" ? <div className="mt-4"><HistoryTable runs={history} empty="Nothing has run yet. Runs from schedules and from “Run now” appear here." /></div> : (
        <div className="mt-4 grid gap-8">
          {items.length ? (
            <ul aria-label="Your workflows" className="grid gap-2">
              {items.map((workflow) => {
                const last = lastRun(workflow.id);
                const active = workflow.state === "active";
                const isRunning = last?.status === "running";
                return (
                  <li key={workflow.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-surface/40 p-3.5">
                    <div className="min-w-0 flex-1 basis-56">
                      <Link href={`/workflows/${workflow.id}`} className="block truncate text-sm font-medium hover:underline">{workflow.name}</Link>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{workflow.schedule}{active && workflow.next_run_at ? ` · next ${formatWhen(workflow.next_run_at)}` : ""}</p>
                    </div>
                    <div className="flex min-w-24 items-center gap-2 text-[11px] text-muted-foreground">{last ? <><StatusBadge status={last.status} /></> : "Never run"}</div>
                    <button type="button" role="switch" aria-checked={active} aria-label={`${active ? "Turn off" : "Turn on"} ${workflow.name}`} disabled={workflow.trigger.kind !== "schedule" || setState.isPending} title={workflow.trigger.kind === "schedule" ? (active ? "On: runs on schedule" : "Off") : "Pick a schedule to turn this on"} onClick={() => setState.mutate({ id: workflow.id, state: active ? "inactive" : "active" })}
                      className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40", active ? "border-sky-300 bg-sky-300/30" : "bg-raised")}><span className={cn("absolute top-0.5 size-3.5 rounded-full bg-foreground transition-all", active ? "left-[18px]" : "left-0.5")} /></button>
                    <button type="button" aria-label={`Run ${workflow.name} now`} title="Run now" disabled={isRunning || runNow.isPending} onClick={() => runNow.mutate(workflow.id)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-40"><Play className="size-4" /></button>
                  </li>
                );
              })}
            </ul>
          ) : workflows.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center"><p className="text-sm font-medium">No workflows yet</p><p className="mt-1 text-xs text-muted-foreground">Describe one in a sentence, or start from a ready-made one below.</p></div>
          )}
          <div>
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Start from a template</h2>
            <TemplateGallery />
          </div>
        </div>
      )}
    </section>
  );
}
