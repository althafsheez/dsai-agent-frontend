"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadJson, fileSafe } from "@/lib/download";
import { cn } from "@/lib/utils";
import { formatWhen } from "../logic/format";
import { useDeleteWorkflow, useRunNow, useSetWorkflowState, useWorkflow, useWorkflowRuns } from "../use-workflows";
import { Connector, StepCard, TriggerCard } from "./flow-parts";
import { HistoryTable } from "./history-table";

export function WorkflowOverviewPage({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const query = useWorkflow(workflowId);
  const runs = useWorkflowRuns(workflowId);
  const runNow = useRunNow();
  const setState = useSetWorkflowState();
  const remove = useDeleteWorkflow();
  const workflow = query.data;
  if (query.isError) return <p className="p-8 text-sm text-muted-foreground">This workflow could not be found.</p>;
  if (!workflow) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  const active = workflow.state === "active";
  const scheduled = workflow.trigger.kind === "schedule";
  const history = runs.data ?? [];
  const running = history.some((run) => run.status === "running");
  const start = () => runNow.mutate(workflow.id, { onSuccess: (run) => router.push(`/workflows/${workflow.id}/runs/${run.id}`) });

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/workflows" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />All workflows</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{workflow.name}</h1>
          {workflow.description ? <p className="mt-1 text-xs text-muted-foreground">{workflow.description}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{workflow.schedule}{active && workflow.next_run_at ? ` · next run ${formatWhen(workflow.next_run_at)}` : ""} · last run {formatWhen(workflow.last_run_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" role="switch" aria-checked={active} aria-label={active ? "Turn off the schedule" : "Turn on the schedule"} disabled={!scheduled || setState.isPending} title={scheduled ? undefined : "Choose a schedule in Edit to turn this on"} onClick={() => setState.mutate({ id: workflow.id, state: active ? "inactive" : "active" })}
            className="flex h-9 items-center gap-2 rounded-md border bg-surface px-3 text-xs disabled:opacity-40"><span className={cn("relative h-4 w-7 rounded-full border", active ? "border-sky-300 bg-sky-300/30" : "bg-raised")}><span className={cn("absolute top-0.5 size-2.5 rounded-full bg-foreground transition-all", active ? "left-[14px]" : "left-0.5")} /></span>{active ? "On" : "Off"}</button>
          <Button type="button" size="sm" disabled={running || runNow.isPending} onClick={start}>{runNow.isPending ? <Loader2 className="animate-spin" /> : <Play />}Run now</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => downloadJson(fileSafe(workflow.name), { name: workflow.name, description: workflow.description, prompt: workflow.prompt, trigger: workflow.trigger, steps: workflow.steps })}><Download />Export</Button>
          <Button asChild type="button" variant="outline" size="sm"><Link href={`/workflows/${workflow.id}/edit`}><Pencil />Edit</Link></Button>
          <Button type="button" variant="outline" size="sm" aria-label="Delete workflow" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete “${workflow.name}” and its run history?`)) remove.mutate(workflow.id, { onSuccess: () => router.push("/workflows") }); }}><Trash2 /></Button>
        </div>
      </header>
      {runNow.isError ? <p role="alert" className="mt-3 text-xs text-rose-300">{runNow.error instanceof Error ? runNow.error.message : "Could not start the run."}</p> : null}

      <div className="mx-auto mt-8 max-w-xl" aria-label="Workflow flow">
        <TriggerCard trigger={workflow.trigger} />
        {workflow.steps.map((step, index) => (
          <div key={step.id}><Connector /><StepCard index={index} step={step} /></div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Run history</h2>
      <HistoryTable runs={history} showName={false} empty="No runs yet. Press Run now, or wait for the schedule." />
    </section>
  );
}
