"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, Database, Download, FileText, Loader2, Pencil, Play, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DatasetPreview } from "@/features/context-sidebar/dataset-preview";
import { useAuth } from "@/features/auth";
import { getLibrary, getPostgresConnections, getWorkflowRunsPage } from "@/lib/api";
import { downloadJson, fileSafe } from "@/lib/download";
import { cn } from "@/lib/utils";
import { formatDuration, formatWhen, runDuration } from "../logic/format";
import { datasetIdsOf, draftOnlyReason } from "../logic/steps";
import { useDeleteWorkflow, useRunNow, useSetWorkflowState, useWorkflow, useWorkflowRuns } from "../use-workflows";
import { Connector, StatusBadge, StepCard, TriggerCard } from "./flow-parts";
import { RunsTable } from "./runs-table";

type Tab = "overview" | "runs";
const RUNS_PER_PAGE = 11;

export function WorkflowOverviewPage({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [page, setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const query = useWorkflow(workflowId);
  const runsQuery = useWorkflowRuns(workflowId);
  const library = useQuery({ queryKey: ["workflow-overview-library"], queryFn: getLibrary });
  const connectionsQuery = useQuery({ queryKey: ["postgres-connections"], queryFn: () => getPostgresConnections() });
  const pageQuery = useQuery({ queryKey: ["workflow-runs-page", workflowId, page], queryFn: () => getWorkflowRunsPage(workflowId, page * RUNS_PER_PAGE, RUNS_PER_PAGE), enabled: tab === "runs", refetchInterval: 5000 });
  const runNow = useRunNow();
  const setState = useSetWorkflowState();
  const remove = useDeleteWorkflow();
  const workflow = query.data;
  if (query.isError) return <p className="p-8 text-sm text-muted-foreground">This workflow could not be found.</p>;
  if (!workflow) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading…</p>;
  const active = workflow.state === "active";
  const draftOnly = draftOnlyReason(workflow.steps);
  const scheduled = workflow.trigger.kind === "schedule";
  const runs = runsQuery.data ?? [];
  const latest = runs[0];
  const running = runs.some((run) => run.status === "running");
  const datasetIds = datasetIdsOf(workflow.steps);
  const datasets = (library.data?.items ?? []).filter((item) => item.resource_type === "dataset" && datasetIds.includes(item.id));
  const connections = Array.from(new Map(workflow.steps.flatMap((step) => {
    const config = step.config;
    if (typeof config?.connection_id !== "string") return [];
    const id = config.connection_id;
    const live = connectionsQuery.data?.items.find((item) => item.id === id);
    const name = live?.name ?? (typeof config.connection_name === "string" ? config.connection_name : "Connection unavailable");
    return [[id, { id, name, provider: typeof config.connection_provider === "string" ? config.connection_provider : "connector" }] as const];
  })).values());
  const preview = datasets.find((dataset) => dataset.id === previewId && dataset.resource_type === "dataset");
  const editUrl = `/workflows/${workflow.id}/edit`;
  const start = () => runNow.mutate(workflow.id, { onSuccess: (run) => router.push(`/workflows/${workflow.id}/runs/${run.id}`) });

  return (
    <section className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/workflows" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" /> Workflows</Link><span aria-hidden="true">/</span><span className="truncate text-foreground">{workflow.name}</span></div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><WorkflowIcon className="size-5" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{workflow.name}</h1><span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{scheduled ? "Scheduled" : "Manual"}</span></div>
            {workflow.description && <p className="mt-1 text-xs text-muted-foreground">{workflow.description}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1"><Clock className="size-3" />{workflow.schedule}</span><span className="rounded-md bg-raised px-2 py-1">Last run: {formatWhen(workflow.last_run_at)}</span>{active && workflow.next_run_at && <span className="rounded-md bg-raised px-2 py-1">Next run: {formatWhen(workflow.next_run_at)}</span>}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" role="switch" aria-checked={active} aria-label={active ? "Turn off the schedule" : "Turn on the schedule"} disabled={!scheduled || setState.isPending || (!active && Boolean(draftOnly))} title={scheduled ? undefined : "Choose a schedule in Edit to turn this on"} onClick={() => setState.mutate({ id: workflow.id, state: active ? "inactive" : "active" })} className="flex h-8 items-center gap-2 rounded-md border bg-surface px-3 text-xs disabled:opacity-40"><span className={cn("relative h-4 w-7 rounded-full border", active ? "border-sky-300 bg-sky-300/30" : "bg-raised")}><span className={cn("absolute top-0.5 size-2.5 rounded-full bg-foreground transition-all", active ? "left-[14px]" : "left-0.5")} /></span>{active ? "On" : "Off"}</button>
          <Button type="button" size="sm" disabled={running || runNow.isPending || Boolean(draftOnly)} onClick={start}>{runNow.isPending ? <Loader2 className="animate-spin" /> : <Play />}Run now</Button>
          <Button asChild variant="outline" size="sm"><Link href={editUrl}><Pencil />Edit</Link></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Export workflow" onClick={() => downloadJson(fileSafe(workflow.name), { name: workflow.name, description: workflow.description, prompt: workflow.prompt, trigger: workflow.trigger, steps: workflow.steps })}><Download /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Delete workflow" disabled={remove.isPending} onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
        </div>
      </header>
      {draftOnly && <p className="mt-3 text-xs text-muted-foreground">{draftOnly}</p>}
      {runNow.isError && <p role="alert" className="mt-3 text-xs text-rose-300">{runNow.error instanceof Error ? runNow.error.message : "Could not start the run."}</p>}
      {setState.isError && <p role="alert" className="mt-3 text-xs text-rose-300">{setState.error.message}</p>}
      <div role="tablist" aria-label="Workflow views" className="mt-5 flex gap-5 border-b">
        {([ ["overview", "Overview"], ["runs", "Runs"] ] as const).map(([value, label]) => <button key={value} id={`workflow-view-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="workflow-view-panel" tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = value === "overview" ? "runs" : "overview"; setTab(next); document.getElementById(`workflow-view-${next}`)?.focus(); } }} onClick={() => setTab(value)} className={cn("border-b-2 px-1 pb-2 text-xs text-muted-foreground", tab === value ? "border-sky-300 font-medium text-foreground" : "border-transparent hover:text-foreground")}>{label}{value === "runs" && running ? " · Running" : ""}</button>)}
        <button type="button" role="tab" disabled aria-selected={false} title="Versions coming later" className="border-b-2 border-transparent px-1 pb-2 text-xs text-muted-foreground/50">Versions <span className="sr-only">coming later</span></button>
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div id="workflow-view-panel" role="tabpanel" aria-labelledby={`workflow-view-${tab}`} className={cn("min-w-0 rounded-xl border bg-surface/40 p-4 sm:p-5", tab === "runs" && "flex min-h-[520px] flex-col lg:min-h-[max(520px,calc(100dvh-320px))]")}>
          {tab === "overview" ? <><h2 className="text-sm font-semibold">Workflow</h2><div className="mx-auto my-8 max-w-xl" aria-label="Workflow flow"><TriggerCard trigger={workflow.trigger} />{workflow.steps.map((step, index) => <div key={step.id}><Connector /><StepCard index={index} step={step} /></div>)}</div></> : <><h2 id="workflow-runs-heading" className="mb-4 text-sm font-semibold">Runs</h2>{pageQuery.data && pageQuery.data.items.length > 0 && <><RunsTable runs={pageQuery.data.items} labelledBy="workflow-runs-heading" /><div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground"><span>Page {page + 1} of {Math.max(1, Math.ceil(pageQuery.data.total / RUNS_PER_PAGE))} · {pageQuery.data.total} runs</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * RUNS_PER_PAGE >= pageQuery.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}{pageQuery.isError && <p role="alert" className="text-xs text-rose-300">Could not load runs.</p>}{pageQuery.isLoading && <p className="text-xs text-muted-foreground">Loading runs…</p>}{pageQuery.isSuccess && !pageQuery.data.items.length && <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">{page ? "No runs on this page." : "No runs yet. Press Run now, or wait for the schedule."}{page > 0 && <Button variant="ghost" size="sm" onClick={() => setPage((value) => value - 1)}>Previous</Button>}</p>}</>}
        </div>
        <aside aria-label="Workflow details" className="space-y-3">
          <section className="rounded-xl border bg-surface/60 p-3.5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xs font-semibold"><FileText className="size-4" />Details</h2><Button asChild variant="ghost" size="sm"><Link href={editUrl}><Pencil />Edit</Link></Button></div><dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs"><dt className="text-muted-foreground">Description</dt><dd className="break-words">{workflow.description || "No description"}</dd><dt className="text-muted-foreground">Owner</dt><dd>{user.name}</dd><dt className="text-muted-foreground">Created</dt><dd>{formatWhen(workflow.created_at)}</dd><dt className="text-muted-foreground">Updated</dt><dd>{formatWhen(workflow.updated_at)}</dd></dl></section>
          <section className="rounded-xl border bg-surface/60 p-3.5"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xs font-semibold"><CalendarDays className="size-4" />Schedule</h2><Button asChild variant="ghost" size="sm"><Link href={editUrl}>Change</Link></Button></div><p className="mt-1 text-xs">{workflow.schedule}</p><p className="mt-1 text-[11px] text-muted-foreground">{scheduled ? active ? "Active" : "Paused" : "Manual trigger"}</p></section>
          <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="flex items-center gap-2 text-xs font-semibold"><Database className="size-4" />Datasets &amp; Resources <span className="text-muted-foreground">{datasetIds.length + connections.length}</span></h2>{library.isLoading && datasetIds.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">Loading datasets…</p> : library.isError && datasetIds.length > 0 ? <p role="alert" className="mt-2 text-xs text-destructive">Could not load datasets.</p> : datasetIds.length ? <ul className="mt-2 space-y-1">{datasetIds.map((id) => <li key={id} className="rounded-md bg-raised px-2 py-1.5 text-xs">{datasets.some((dataset) => dataset.id === id) ? <button type="button" className="text-left text-sky-300 hover:underline" onClick={() => setPreviewId(id)}>{datasets.find((dataset) => dataset.id === id)?.name}</button> : "Dataset unavailable"}</li>)}</ul> : null}{connections.length > 0 && <ul className="mt-2 space-y-1">{connections.map((connection) => <li key={connection.id} className="rounded-md bg-raised px-2 py-1.5 text-xs"><Link href="/extensions" className="hover:underline">{connection.name}</Link><span className="ml-2 text-muted-foreground">{connection.provider === "postgresql" ? "PostgreSQL" : connection.provider}</span></li>)}</ul>}{!datasetIds.length && !connections.length && <p className="mt-2 text-xs text-muted-foreground">No datasets or connections attached.</p>}</section>
          <section className="rounded-xl border bg-surface/60 p-3.5"><h2 className="flex items-center gap-2 text-xs font-semibold"><Clock className="size-4" />Last run {latest && <StatusBadge status={latest.status} />}</h2>{latest ? <><p className="mt-2 text-xs text-muted-foreground">{formatWhen(latest.started_at)}{latest.finished_at ? ` · ${formatDuration(runDuration(latest))}` : ""}</p><Link href={`/workflows/${workflow.id}/runs/${latest.id}`} className="mt-2 inline-block text-xs text-sky-300 hover:underline">View run details →</Link></> : <p className="mt-2 text-xs text-muted-foreground">No runs yet.</p>}</section>
        </aside>
      </div>
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!remove.isPending) { setDeleteOpen(open); if (!open) { setDeleteConfirmation(""); remove.reset(); } } }}>
        <DialogContent>
          <DialogTitle className="text-base font-semibold">Delete workflow</DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-5 text-muted-foreground">This permanently deletes “{workflow.name}” and its run history. Type DELETE to confirm.</DialogDescription>
          <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); if (deleteConfirmation === "DELETE" && !remove.isPending) remove.mutate(workflow.id, { onSuccess: () => router.push("/workflows") }); }}>
            <label className="block text-xs font-medium">Type DELETE<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-border-strong" /></label>
            {remove.isError && <p role="alert" className="text-xs text-destructive">{remove.error.message || "Could not delete workflow."}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={remove.isPending} onClick={() => { setDeleteOpen(false); setDeleteConfirmation(""); remove.reset(); }}>Cancel</Button><Button type="submit" disabled={deleteConfirmation !== "DELETE" || remove.isPending} className="bg-destructive text-white">{remove.isPending ? "Deleting…" : "Delete workflow"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreviewId(undefined); }}><DialogContent className="max-h-[80vh] max-w-3xl overflow-auto"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription className="text-xs text-muted-foreground">Dataset preview</DialogDescription>{preview?.resource_type === "dataset" && <DatasetPreview dataset={preview} />}</DialogContent></Dialog>
    </section>
  );
}
