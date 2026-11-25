"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getLibrary, getPostgresConnections } from "@/lib/api";
import { ArrowLeft, ChevronDown, Clock, FileOutput, Loader2, PanelRightClose, PanelRightOpen, RotateCcw, Square } from "lucide-react";
import type { WorkflowStepResultDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, formatWhen, runDuration } from "../logic/format";
import { kindInfo } from "../logic/steps";
import { useCancelRun, useNow, useRunNow, useWorkflowRun } from "../use-workflows";
import { Connector, StatusBadge, StepIcon } from "./flow-parts";
import { WorkflowOutput } from "./workflow-output";
import { WorkflowStepProgress } from "./workflow-step-progress";
import { isWorkflowQueryTable } from "./workflow-query-preview";

type OutputFile = { id: string; name: string };
function outputFiles(value: unknown): OutputFile[] {
  if (!value || typeof value !== "object") return [];
  const resources = (value as Record<string, unknown>).resources;
  return Array.isArray(resources) ? resources.filter((item): item is OutputFile => Boolean(item && typeof item.id === "string" && typeof item.name === "string")) : [];
}

function OutputBlock({ result, index, expanded, onToggle }: { result: WorkflowStepResultDto; index: number; expanded: boolean; onToggle: () => void }) {
  if (result.output == null) return null;
  const table = isWorkflowQueryTable(result.output) ? result.output : null;
  const heading = result.kind === "notify" ? "Final output" : table ? "Query results" : result.kind === "ai" ? "Analysis result" : "Step output";
  const files = outputFiles(result.output);
  return <div className="mx-auto max-w-[90%] rounded-lg border bg-background/50">
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left hover:bg-raised/50">
      <FileOutput className="size-4 shrink-0 text-slate" />
      <span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Output {String(index + 1).padStart(2, "0")}</span><span className="block text-sm font-medium">{heading}</span>{table && <span className="block text-xs text-muted-foreground">{table.row_count} rows · {table.columns.length} columns</span>}{files.length > 0 && <span className="block text-xs text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"}</span>}</span>
      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
    </button>
    {expanded && <div className="border-t p-3 text-xs"><WorkflowOutput value={result.output} /></div>}
  </div>;
}

function ExecutionStep({ result, index, expanded, onToggle }: { result: WorkflowStepResultDto; index: number; expanded: boolean; onToggle: () => void }) {
  const input = result.input && typeof result.input === "object" ? result.input as Record<string, unknown> : {};
  const sql = result.kind === "data" && typeof input.sql === "string" ? input.sql : "";
  const prompt = result.kind === "ai" && typeof input.prompt === "string" ? input.prompt : "";
  const duration = result.started_at && result.finished_at ? Date.parse(result.finished_at) - Date.parse(result.started_at) : null;
  return <section aria-label={`Step ${index + 1}: ${result.title}`} className="rounded-lg border bg-surface/60">
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left hover:bg-raised/50">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-raised text-slate"><StepIcon kind={result.kind} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Step {String(index + 1).padStart(2, "0")} · {kindInfo(result.kind).label}</span><span className="block truncate text-sm font-medium">{result.title}</span></span>
      {duration !== null && <span className="hidden text-xs text-muted-foreground sm:inline">{formatDuration(duration)}</span>}
      <StatusBadge status={result.status} /><ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
    </button>
    {expanded && <div className="space-y-3 border-t p-3 text-xs">
      <WorkflowStepProgress step={result} />
      {sql && <div><p className="mb-2 font-medium">SQL query</p><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-background/60 p-3 font-mono text-[11px] text-muted-foreground">{sql}</pre></div>}
      {prompt && <div><p className="mb-2 font-medium">Instructions</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{prompt}</p></div>}
      {result.logs.length > 0 && <ul aria-label="Log" className="space-y-1 rounded-md border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">{result.logs.map((line, position) => <li key={position}>{line}</li>)}</ul>}
      {!sql && !prompt && !result.logs.length && !result.error && result.status !== "running" && <p className="text-muted-foreground">No additional details recorded.</p>}
      {result.error && <p role="alert" className="rounded-md border border-rose-400/40 p-2 text-rose-300">{result.error}</p>}
    </div>}
  </section>;
}

export function WorkflowRunPage({ workflowId, runId }: { workflowId: string; runId: string }) {
  const router = useRouter();
  const query = useWorkflowRun(runId);
  const cancel = useCancelRun();
  const rerun = useRunNow();
  const connections = useQuery({ queryKey: ["postgres-connections"], queryFn: () => getPostgresConnections(), enabled: Boolean(query.data?.results.some((step) => step.input && typeof step.input === "object" && typeof (step.input as Record<string, unknown>).connection_id === "string")) });
  const library = useQuery({ queryKey: ["workflow-overview-library"], queryFn: getLibrary, enabled: Boolean(query.data?.results.some((step) => step.input && typeof step.input === "object" && Array.isArray((step.input as Record<string, unknown>).dataset_ids))) });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedOutputs, setCollapsedOutputs] = useState<Set<string>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const run = query.data;
  const now = useNow(run?.status === "running");
  if (query.isError) return <p className="p-8 text-sm text-muted-foreground">This run could not be found.</p>;
  if (!run) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading…</p>;
  const completed = run.results.filter((step) => step.status === "success").length;
  const files = Array.from(new Map(run.results.flatMap((step) => outputFiles(step.output).map((file) => [file.id, file] as const))).values());
  const inputs = run.results.flatMap((step) => step.input && typeof step.input === "object" ? [step.input as Record<string, unknown>] : []);
  const connectionIds = Array.from(new Set(inputs.flatMap((input) => typeof input.connection_id === "string" ? [input.connection_id] : [])));
  const datasetIds = Array.from(new Set(inputs.flatMap((input) => Array.isArray(input.dataset_ids) ? input.dataset_ids.filter((id): id is string => typeof id === "string") : [])));
  const models = Array.from(new Set(run.results.flatMap((step) => {
    if (step.kind !== "ai" || !step.input || typeof step.input !== "object") return [];
    const model = (step.input as Record<string, unknown>).model;
    return typeof model === "string" ? [model] : [];
  })));
  const trigger = run.trigger === "schedule" ? "Scheduled trigger" : run.trigger === "test" ? "Test run" : "Manual trigger";
  function toggle(setter: typeof setExpanded, id: string) { setter((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function expandAll() { setExpanded(new Set(run!.results.map((step) => step.step_id))); setCollapsedOutputs(new Set()); }
  function collapseAll() { setExpanded(new Set()); setCollapsedOutputs(new Set(run!.results.map((step) => step.step_id))); }

  return <section className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/workflows" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Workflows</Link><span>/</span><Link href={`/workflows/${workflowId}`} className="hover:text-foreground">{run.workflow_name}</Link><span>/</span><span className="text-foreground">Run details</span></div>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">Run details <StatusBadge status={run.status} /></h1><p className="mt-2 text-xs text-muted-foreground">{formatWhen(run.started_at)} · {trigger} · {formatDuration(runDuration(run, now))} · {completed}/{run.results.length} steps completed</p></div><div className="flex gap-2">{run.status === "running" ? <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(run.id)}>{cancel.isPending ? <Loader2 className="animate-spin" /> : <Square />}Stop</Button> : <Button type="button" variant="outline" size="sm" disabled={rerun.isPending} title="Run the current saved workflow" onClick={() => rerun.mutate(workflowId, { onSuccess: (next) => router.push(`/workflows/${workflowId}/runs/${next.id}`) })}><RotateCcw />Rerun</Button>}<Button type="button" variant="outline" size="icon" aria-label={sidebarOpen ? "Hide run details" : "Show run details"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button></div></header>
    {(run.error || cancel.isError || rerun.isError) && <p role="alert" className="mt-4 rounded-md border border-rose-400/40 p-3 text-xs text-rose-300">{run.error || cancel.error?.message || rerun.error?.message}</p>}
    <div className={cn("mt-5 grid items-start gap-4", sidebarOpen && "lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <section aria-label="Execution flow" className="min-w-0 rounded-xl border bg-surface/40 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Execution flow</h2><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={expandAll}>Expand all</Button><Button type="button" variant="ghost" size="sm" onClick={collapseAll}>Collapse all</Button></div></div>
        <div className="mx-auto mt-4 max-w-3xl lg:max-h-[calc(100dvh-310px)] lg:overflow-y-auto lg:pr-2" aria-label="Run steps">
          <div className="flex items-center gap-3 rounded-lg border border-sky-300/30 bg-sky-300/5 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-raised text-slate"><Clock className="size-4" /></span><div><p className="text-sm font-medium">{trigger}</p><p className="text-xs text-muted-foreground">Started {formatWhen(run.started_at)}</p></div></div>
          {run.results.map((result, index) => <div key={result.step_id}><Connector /><ExecutionStep result={result} index={index} expanded={expanded.has(result.step_id)} onToggle={() => toggle(setExpanded, result.step_id)} />{result.output != null && <><Connector /><OutputBlock result={result} index={index} expanded={!collapsedOutputs.has(result.step_id)} onToggle={() => toggle(setCollapsedOutputs, result.step_id)} /></>}</div>)}
          {!run.results.length && <p className="mt-4 text-xs text-muted-foreground">No steps were recorded for this run.</p>}
        </div>
      </section>
      {sidebarOpen && <aside aria-label="Run information" className="space-y-3 lg:sticky lg:top-4"><section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="text-xs font-semibold">Run details</h2><dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs"><dt className="text-muted-foreground">Run ID</dt><dd className="break-all">{run.id}</dd><dt className="text-muted-foreground">Trigger</dt><dd>{trigger}</dd><dt className="text-muted-foreground">Started</dt><dd>{formatWhen(run.started_at)}</dd><dt className="text-muted-foreground">Finished</dt><dd>{run.finished_at ? formatWhen(run.finished_at) : run.status === "running" ? "In progress" : "Not recorded"}</dd></dl></section>
        <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="text-xs font-semibold">Execution time</h2><ul className="mt-3 space-y-2 text-xs">{run.results.map((step) => <li key={step.step_id} className="flex justify-between gap-2"><span className="min-w-0 truncate text-muted-foreground">{step.title}</span><span className="shrink-0">{step.started_at && step.finished_at ? formatDuration(Date.parse(step.finished_at) - Date.parse(step.started_at)) : "—"}</span></li>)}</ul></section>
        <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="text-xs font-semibold">Outputs</h2>{files.length ? <div className="mt-3 text-xs"><WorkflowOutput value={{ resources: files }} /></div> : <p className="mt-2 text-xs text-muted-foreground">No files recorded.</p>}</section>
        {models.length > 0 && <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="text-xs font-semibold">AI usage</h2><p className="mt-2 break-words text-xs text-muted-foreground">Model: {models.join(", ")}</p></section>}
        {(connectionIds.length > 0 || datasetIds.length > 0) && <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="text-xs font-semibold">Resources</h2><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{connectionIds.map((id) => <li key={`connection-${id}`}><Link href="/extensions" className="hover:text-foreground hover:underline">{connections.data?.items.find((item) => item.id === id)?.name ?? (connections.isLoading ? "Loading connection…" : "Connection unavailable")}</Link><span className="ml-1">· Connection</span></li>)}{datasetIds.map((id) => <li key={`dataset-${id}`}><Link href="/library" className="hover:text-foreground hover:underline">{library.data?.items.find((item) => item.id === id && item.resource_type === "dataset")?.name ?? (library.isLoading ? "Loading dataset…" : "Dataset unavailable")}</Link><span className="ml-1">· Dataset</span></li>)}</ul></section>}
      </aside>}
    </div>
  </section>;
}
