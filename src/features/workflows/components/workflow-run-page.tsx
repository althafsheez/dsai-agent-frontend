"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Square } from "lucide-react";
import type { WorkflowStepResultDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatDuration, formatWhen, runDuration } from "../logic/format";
import { useCancelRun, useNow, useWorkflowRun } from "../use-workflows";
import { Connector, StatusBadge, StepCard } from "./flow-parts";
import { WorkflowOutput } from "./workflow-output";
import { WorkflowStepProgress } from "./workflow-step-progress";

function Panel({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/60">
      <p className="border-b px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <div className="p-2.5 text-xs"><WorkflowOutput value={value} empty={empty} /></div>
    </div>
  );
}

function StepResult({ index, result }: { index: number; result: WorkflowStepResultDto }) {
  const waiting = result.status === "pending";
  return (
    <StepCard index={index} step={{ kind: result.kind, title: result.title, detail: "" }} status={result.status}>
      {waiting ? null : (
        <div className="mt-3 grid gap-2.5">
          <WorkflowStepProgress step={result} />
          <div className="grid gap-2.5 md:grid-cols-2">
            <Panel title="Input" value={result.input} empty={result.status === "running" ? "Reading…" : "No input"} />
            <Panel title="Output" value={result.output} empty={result.status === "running" ? "Working…" : result.status === "skipped" ? "Skipped" : "No output"} />
          </div>
          {result.logs.length ? <ul aria-label="Log" className="rounded-lg border bg-background/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{result.logs.map((line, position) => <li key={position}>{line}</li>)}</ul> : null}
          {result.error ? <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/5 px-2.5 py-2 text-xs text-rose-300">{result.error}</p> : null}
        </div>
      )}
    </StepCard>
  );
}

/** One run, step by step. While it runs the page refreshes every second so input and output fill in side by side. */
export function WorkflowRunPage({ workflowId, runId }: { workflowId: string; runId: string }) {
  const query = useWorkflowRun(runId);
  const cancel = useCancelRun();
  const run = query.data;
  const now = useNow(run?.status === "running");
  if (query.isError) return <p className="p-8 text-sm text-muted-foreground">This run could not be found.</p>;
  if (!run) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href={`/workflows/${workflowId}`} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{run.workflow_name}</Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">Run<StatusBadge status={run.status} /></h1>
          <p className="mt-1 text-xs text-muted-foreground">Started {formatWhen(run.started_at)} · {run.trigger === "test" ? "as a test" : run.trigger === "schedule" ? "by its schedule" : "by hand"} · {run.status === "running" ? `running for ${formatDuration(runDuration(run, now))}` : `took ${formatDuration(runDuration(run))}`}</p>
        </div>
        {run.status === "running" ? <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(run.id)}>{cancel.isPending ? <Loader2 className="animate-spin" /> : <Square />}Stop</Button> : null}
      </header>
      {run.error ? <p role="alert" className="mt-4 rounded-lg border border-rose-400/40 bg-rose-400/5 p-3 text-xs text-rose-300">{run.error}</p> : null}
      <div className="mx-auto mt-6 max-w-2xl" aria-label="Run steps">
        {run.results.map((result, index) => (
          <div key={result.step_id}>
            {index ? <Connector /> : null}
            <StepResult index={index} result={result} />
          </div>
        ))}
      </div>
    </section>
  );
}
