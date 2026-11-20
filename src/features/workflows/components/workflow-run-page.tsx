"use client";

import Link from "next/link";
import { ArrowLeft, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "../logic/run-view";
import { useCancelRun, useRunViews, useWorkflow, useWorkflowRun } from "../use-workflows";
import { StatusBadge, stepIcon } from "./workflow-parts";

export function WorkflowRunPage({ workflowId, runId }: { workflowId: string; runId: string }) {
  const runQuery = useWorkflowRun(runId);
  const workflowQuery = useWorkflow(workflowId);
  const cancel = useCancelRun();
  const [view] = useRunViews(runQuery.data ? [runQuery.data] : undefined);

  if (runQuery.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading run…</p>;
  if (!runQuery.data || runQuery.data.workflow_id !== workflowId || !view) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Run not found</h1>
        <Button asChild variant="outline" className="mt-5"><Link href={`/workflows/${workflowId}`}><ArrowLeft />Back to workflow</Link></Button>
      </section>
    );
  }
  const { run } = view;
  const logLines = view.steps.filter((step) => step.status !== "pending" && step.status !== "skipped" && step.status !== "cancelled").flatMap((step) => step.log.map((line) => ({ step: step.title, line, error: line.startsWith("Error") })));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/workflows" className="hover:text-foreground">Workflows</Link><span>/</span>
        <Link href={`/workflows/${workflowId}`} className="truncate hover:text-foreground">{workflowQuery.data?.name ?? run.workflow_name}</Link><span>/</span><span className="text-foreground">Run</span>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-xl font-semibold tracking-tight">{run.workflow_name}</h1><StatusBadge status={view.status} /></div>
          <p className="mt-1 text-xs text-muted-foreground">Run {run.id} · started {new Date(run.started_at).toLocaleString()}</p>
        </div>
        {view.status === "running" ? <Button variant="outline" onClick={() => cancel.mutate(run.id)} disabled={cancel.isPending}><Square />Cancel run</Button> : null}
      </header>

      <dl className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Trigger", run.trigger],
          ["Duration", formatDuration(view.elapsed_ms)],
          ["Finished", view.finished_at ? new Date(view.finished_at).toLocaleTimeString() : "In progress"],
          ["Steps", `${view.steps.filter((step) => step.status === "success").length}/${view.steps.length} done`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-surface/50 p-3"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold first-letter:uppercase">{value}</dd></div>
        ))}
      </dl>

      <section className="mt-6" aria-label="Step timeline">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Steps</h2>
        <ol className="space-y-2">
          {view.steps.map((step) => {
            const Icon = stepIcon[step.kind];
            return (
              <li key={step.step_id} className={cn("rounded-lg border bg-surface/40 p-3", step.status === "failed" && "border-red-400/50", step.status === "running" && "border-sky-300/50")}>
                <div className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-slate"><Icon className="size-3.5" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.title}</span>
                  <span className="text-[11px] text-muted-foreground">{step.status === "pending" || step.status === "skipped" ? "" : formatDuration(step.status === "running" ? Math.max(0, view.elapsed_ms - step.offset_ms) : step.duration_ms)}</span>
                  <StatusBadge status={step.status} />
                </div>
                {step.status === "failed" ? <p role="alert" className="mt-2 pl-10 text-[11px] text-red-300">{step.log.find((line) => line.startsWith("Error")) ?? "This step failed."}</p> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-6" aria-label="Run log">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Log</h2>
        <pre className="max-h-72 overflow-auto rounded-lg border bg-surface/40 p-3 font-mono text-[11px] leading-5">
          {logLines.length ? logLines.map((entry, index) => <span key={index} className={cn("block", entry.error ? "text-red-300" : "text-muted-foreground")}><span className="text-foreground/70">[{entry.step}]</span> {entry.line}</span>) : "Waiting for the first step…"}
        </pre>
      </section>
    </section>
  );
}
