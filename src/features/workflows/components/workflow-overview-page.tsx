"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeTrigger } from "../logic/generate-workflow";
import { formatDuration, formatWhen } from "../logic/run-view";
import { useDeleteWorkflow, useRunViews, useSetWorkflowState, useStartRun, useWorkflow, useWorkflowRuns } from "../use-workflows";
import { RunsTable, StateBadge, StatusBadge, WorkflowDiagram } from "./workflow-parts";

type Tab = "runs" | "logs";

export function WorkflowOverviewPage({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const workflowQuery = useWorkflow(workflowId);
  const runsQuery = useWorkflowRuns(workflowId);
  const views = useRunViews(runsQuery.data);
  const startRun = useStartRun();
  const setState = useSetWorkflowState();
  const remove = useDeleteWorkflow();
  const [tab, setTab] = useState<Tab>("runs");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const workflow = workflowQuery.data;

  if (workflowQuery.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading workflow…</p>;
  if (!workflow) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Workflow not found</h1>
        <p className="mt-2 text-xs text-muted-foreground">It may have been deleted, or it only exists in another browser.</p>
        <Button asChild variant="outline" className="mt-5"><Link href="/workflows"><ArrowLeft />Back to workflows</Link></Button>
      </section>
    );
  }

  const latest = views[0];
  const running = latest?.status === "running";
  const succeeded = views.filter((view) => view.status === "success").length;
  const finished = views.filter((view) => view.status !== "running").length;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
        <Link href="/workflows" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Workflows</Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{workflow.name}</h1>
            <StateBadge state={workflow.state} />
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{workflow.description || "No description."}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">{describeTrigger(workflow.trigger)} · Updated {formatWhen(workflow.updated_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setState.mutate({ id: workflow.id, state: workflow.state === "active" ? "inactive" : "active" })} disabled={setState.isPending}>
            {workflow.state === "active" ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="outline" asChild><Link href={`/workflows/${workflow.id}/edit`}><Pencil />Edit</Link></Button>
          <Button onClick={() => startRun.mutate(workflow.id)} disabled={running || startRun.isPending}><Play />{running ? "Running…" : "Run now"}</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Total runs", String(views.length)],
          ["Success rate", finished ? `${Math.round((succeeded / finished) * 100)}%` : "—"],
          ["Last run", latest ? formatWhen(latest.run.started_at) : "Never"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-surface/50 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tracking-tight">{value}</p></div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border bg-surface/40 p-4" aria-label="Workflow diagram">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Flow</h2>
        <WorkflowDiagram workflow={workflow} statuses={latest ? Object.fromEntries(latest.steps.map((step) => [step.step_id, step.status])) : undefined} />
        {latest ? <p className="mt-2 text-[11px] text-muted-foreground">Coloured by the latest run.</p> : null}
      </section>

      <div className="mt-8">
        <div role="tablist" aria-label="Workflow history" className="flex w-fit rounded-lg border bg-surface p-1">
          {([["runs", "Runs"], ["logs", "Logs"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground", tab === value && "bg-raised text-foreground shadow-sm")}>{label}</button>
          ))}
        </div>
        <div className="mt-4">
          {tab === "runs" ? <RunsTable views={views} showWorkflow={false} empty="This workflow has not run yet." /> : (
            views.length ? (
              <div className="space-y-3">
                {views.slice(0, 10).map((view) => (
                  <details key={view.run.id} open={view === views[0]} className="rounded-lg border bg-surface/40">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2.5 text-xs">
                      <span className="font-medium">{new Date(view.run.started_at).toLocaleString()}</span><StatusBadge status={view.status} />
                      <span className="text-muted-foreground">{formatDuration(view.elapsed_ms)}</span>
                      <Link href={`/workflows/${workflow.id}/runs/${view.run.id}`} className="ml-auto text-slate hover:underline">Details</Link>
                    </summary>
                    <pre className="overflow-x-auto border-t px-3 py-2.5 font-mono text-[11px] leading-5 text-muted-foreground">{view.steps.filter((step) => step.status !== "pending" && step.status !== "skipped").flatMap((step) => step.log.map((line) => `[${step.title}] ${line}`)).join("\n") || "No log lines yet."}</pre>
                  </details>
                ))}
              </div>
            ) : <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">No logs yet. Run the workflow to see them.</p>
          )}
        </div>
      </div>

      <div className="mt-10 border-t pt-5">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>Delete “{workflow.name}” and its {views.length} runs? This cannot be undone.</span>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button size="sm" className="bg-red-500/90 text-white" onClick={() => remove.mutate(workflow.id, { onSuccess: () => router.push("/workflows") })}>Delete</Button>
          </div>
        ) : <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 />Delete workflow</Button>}
      </div>
    </section>
  );
}
