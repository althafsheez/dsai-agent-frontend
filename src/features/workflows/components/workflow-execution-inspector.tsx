"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowRunRecordDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDuration, formatWhen, pretty } from "../logic/format";
import { useCancelRun, useWorkflowRuns } from "../use-workflows";
import { StatusBadge } from "./flow-parts";
import { WorkflowOutput } from "./workflow-output";
import { WorkflowStepProgress } from "./workflow-step-progress";

const tabs = ["Results", "Logs", "Outputs", "Run history"] as const;

export function WorkflowExecutionInspector({ workflowId, open, onToggle, run }: {
  workflowId?: string;
  open: boolean;
  onToggle: () => void;
  run?: WorkflowRunRecordDto;
}) {
  return (
    <section className="rounded-xl border bg-surface">
      <button type="button" aria-expanded={open} onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium">
        <ChevronDown className={cn("size-4 text-muted-foreground", !open && "-rotate-90")} />
        Execution inspector
        {run && <StatusBadge status={run.status} />}
      </button>
      {open && (workflowId ? <InspectorContent key={run?.id ?? workflowId} workflowId={workflowId} latest={run} /> :
        <p className="border-t p-3 text-xs text-muted-foreground">Save the workflow before starting a test run.</p>)}
    </section>
  );
}

function InspectorContent({ workflowId, latest }: { workflowId: string; latest?: WorkflowRunRecordDto }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Results");
  const [selected, setSelected] = useState("");
  const history = useWorkflowRuns(workflowId);
  const cancel = useCancelRun();
  const run = selected ? history.data?.find((item) => item.id === selected) : latest ?? history.data?.[0];

  return (
    <div className="border-t">
      <div aria-label="Execution views" className="flex flex-wrap items-center gap-1 border-b p-1">
        {tabs.map((name) => <Button key={name} size="sm" variant="ghost" aria-pressed={tab === name}
          className={cn(tab === name && "bg-raised")} onClick={() => setTab(name)}>{name}</Button>)}
      </div>
      <div className="max-h-72 space-y-3 overflow-auto p-3 text-xs">
        {history.isError && <p role="alert">Run history could not be loaded.</p>}
        {cancel.isError && <p role="alert">{cancel.error.message}</p>}
        {tab === "Run history" ? (
          <ul className="divide-y">{history.data?.map((item) => <li key={item.id}>
            <button type="button" className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-slate"
              onClick={() => { setSelected(item.id); setTab("Results"); }}>
              <span>{formatWhen(item.started_at)} · {item.trigger === "test" ? "Test" : item.trigger === "schedule" ? "Scheduled" : "Manual"}</span>
              <StatusBadge status={item.status} />
            </button>
          </li>)}</ul>
        ) : run && <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{run.trigger === "test" ? "Test run" : "Workflow run"}</span>
            <StatusBadge status={run.status} />
            <Link className="text-muted-foreground hover:underline" href={`/workflows/${workflowId}/runs/${run.id}`}>Open run</Link>
            {run.status === "running" && <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(run.id)}><Square /> Cancel run</Button>}
          </div>
          {run.results.filter((result) => result.status === "running").map((result) => (
            <WorkflowStepProgress key={result.step_id} step={result} />
          ))}
          {run.error && <p role="alert" className="text-destructive">{run.error}</p>}
          {tab === "Results" && run.results.map((result) => (
            <details key={result.step_id} className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer">
                {result.title} <StatusBadge status={result.status} />
                {result.started_at && result.finished_at && <span className="ml-2 text-muted-foreground">{formatDuration(Date.parse(result.finished_at) - Date.parse(result.started_at))}</span>}
              </summary>
              {result.error && <p className="mt-2 text-destructive">{result.error}</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="min-w-0"><p className="font-medium">Input</p><pre className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{pretty(result.input) || "—"}</pre></div>
                <div className="min-w-0"><p className="font-medium">Output</p><WorkflowOutput value={result.output} empty="—" /></div>
              </div>
            </details>
          ))}
          {tab === "Logs" && (run.results.some((result) => result.logs.length)
            ? <ul className="space-y-1 font-mono">{run.results.flatMap((result) => result.logs.map((line, index) => <li key={`${result.step_id}-${index}`}>{result.title} · {line}</li>))}</ul>
            : <p className="text-muted-foreground">No logs yet.</p>)}
          {tab === "Outputs" && (run.results.some((result) => result.output != null)
            ? run.results.filter((result) => result.output != null).map((result) => <details key={result.step_id} className="rounded-md border p-2"><summary className="cursor-pointer">{result.title}</summary>
              <WorkflowOutput value={result.output} /></details>)
            : <p className="text-muted-foreground">No outputs yet.</p>)}
        </>}
        {(!run || (tab === "Run history" && !history.data?.length)) && !history.isError && <p className="text-muted-foreground">{history.isLoading ? "Loading runs…" : "No runs yet."}</p>}
      </div>
    </div>
  );
}
