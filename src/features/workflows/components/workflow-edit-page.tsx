"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft, ArrowUp, Clock, Copy, Database, GripVertical, LayoutList, Maximize, Minus,
  PanelRight, Play, Plus, Redo2, Settings2, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowRecordDto, WorkflowSaveBody, WorkflowStepDto, WorkflowStepKind } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DatasetPreview } from "@/features/context-sidebar/dataset-preview";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDashboardDatasets } from "@/features/dashboards/use-dashboards";
import { attachedIds, datasetIdsOf, describeSchedule, executionIssues, makeTrigger, newStep, newStepId, scriptDatasetIds, scriptReady } from "../logic/steps";
import { TEMPLATES, templateToDraft } from "../logic/templates";
import { useSaveWorkflow, useSetWorkflowState, useTestWorkflow, useWorkflow, useWorkflowAi, useWorkflowRun } from "../use-workflows";
import { StatusBadge, StepIcon } from "./flow-parts";
import { TriggerChooser, TriggerConfiguration, type TriggerType } from "./trigger-configuration";
import { StepActions, StepEditor } from "./step-editor";
import { WorkflowExecutionInspector } from "./workflow-execution-inspector";
import { WorkflowStepProgress } from "./workflow-step-progress";
import { stepLabels, WorkflowStepPicker } from "./workflow-step-picker";

type Proposal = Pick<WorkflowSaveBody, "name" | "steps" | "prompt" | "description">;
const tabs = ["Configuration", "AI Assistant"] as const;
type InspectorTab = (typeof tabs)[number];
const inputClass = "w-full rounded-md border bg-background px-2.5 py-2 text-sm text-foreground";
const hiddenTrigger = { kind: "manual", config: { show_on_canvas: false } } as const;
const stepLabel = (kind: string) => stepLabels[kind as keyof typeof stepLabels] ?? kind;

export function WorkflowEditPage({ workflowId }: { workflowId: string }) {
  const workflow = useWorkflow(workflowId);
  if (workflow.isError) return <p role="alert" className="p-8 text-sm">This workflow could not be loaded.</p>;
  if (!workflow.data) return <p role="status" className="p-8 text-sm">Loading workflow…</p>;
  return <WorkflowEditor key={workflowId} workflow={workflow.data} publishedState={workflow.data.state} />;
}

export function NewWorkflowPage({ templateId }: { templateId?: string }) {
  const template = TEMPLATES.find((item) => item.id === templateId);
  const draft = template ? templateToDraft(template) : {
    name: "", description: "", prompt: "", trigger: hiddenTrigger, steps: [],
  };
  return <WorkflowEditor key={templateId} workflow={{ ...draft, state: "draft" }} />;
}

function WorkflowEditor({ workflow, publishedState }: { workflow: WorkflowSaveBody; publishedState?: WorkflowRecordDto["state"] }) {
  const router = useRouter();
  const ai = useWorkflowAi();
  const save = useSaveWorkflow();
  const setState = useSetWorkflowState();
  const test = useTestWorkflow();
  const datasets = useDashboardDatasets();
  const [history, setHistory] = useState({ previous: [] as WorkflowSaveBody[], draft: workflow, next: [] as WorkflowSaveBody[] });
  const { draft } = history;
  const state = publishedState ?? draft.state;
  const active = state === "active";
  const [selected, setSelected] = useState<string | null>(null);
  const [triggerView, setTriggerView] = useState<"choose" | "webhook" | null>(null);
  const [tab, setTab] = useState<InspectorTab>("Configuration");
  const [rightOpen, setRightOpen] = useState(true);
  const [picker, setPicker] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [instruction, setInstruction] = useState("");
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState("");
  const [executionOpen, setExecutionOpen] = useState(false);
  const [testIssue, setTestIssue] = useState("");
  const [runId, setRunId] = useState<string>();
  const [previewId, setPreviewId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const run = useWorkflowRun(runId);
  const canvas = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const hasTrigger = draft.trigger.kind !== "manual" || draft.trigger.config?.show_on_canvas !== false;
  const busy = ai.plan.isPending || ai.build.isPending || save.isPending || setState.isPending || test.isPending;
  const error = ai.plan.error ?? ai.build.error ?? save.error ?? setState.error ?? test.error;
  const stepIndex = draft.steps.findIndex((step) => step.id === selected);
  const step = draft.steps[stepIndex];
  const runningStep = run.data?.results.find((result) => result.step_id === step?.id && result.status === "running");
  const issues = executionIssues(draft.name, draft.steps);
  const testName = draft.name.trim() || "Untitled workflow";
  const testIssues = draft.name.trim() ? issues : executionIssues(testName, draft.steps);
  const allDatasets = [...new Set(draft.steps.flatMap(attachedIds))];
  const preview = datasets.data?.find((item) => item.id === previewId);
  const buildDatasetIds = step ? scriptDatasetIds(draft.steps, stepIndex) : [];

  function update(patch: Partial<WorkflowSaveBody>) {
    setHistory(({ previous, draft }) => ({ previous: [...previous.slice(-49), draft], draft: { ...draft, ...patch }, next: [] }));
    setNotice("");
    setTestIssue("");
  }

  function undo() {
    setHistory(({ previous, draft, next }) => previous.length
      ? { previous: previous.slice(0, -1), draft: previous[previous.length - 1], next: [draft, ...next] }
      : { previous, draft, next });
  }

  function redo() {
    setHistory(({ previous, draft, next }) => next.length
      ? { previous: [...previous, draft], draft: next[0], next: next.slice(1) }
      : { previous, draft, next });
  }

  function select(id: string | null) {
    setSelected(id);
    setTriggerView(null);
    setTab("Configuration");
    setRightOpen(true);
  }

  function add(kind: WorkflowStepKind | "trigger", index: number) {
    if (kind === "trigger") {
      select(hasTrigger ? "trigger" : null);
      setTriggerView("choose");
    } else {
      const item = newStep(kind);
      if (kind === "script" || kind === "ai") item.title = stepLabels[kind];
      update({ steps: [...draft.steps.slice(0, index), item, ...draft.steps.slice(index)] });
      select(item.id);
    }
    setPicker(null);
  }

  function configureTrigger(kind: TriggerType) {
    if (kind === "webhook") {
      setTriggerView("webhook");
      return;
    }
    if (!hasTrigger || draft.trigger.kind !== kind) {
      update({ trigger: makeTrigger(kind === "schedule" ? "daily" : "manual") });
    }
    select("trigger");
  }

  function removeStep(id: string) {
    update({ steps: draft.steps.filter((item) => item.id !== id) });
    if (selected === id) select(null);
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.steps.length) return;
    const steps = [...draft.steps];
    const [item] = steps.splice(from, 1);
    steps.splice(to, 0, item);
    update({ steps });
  }

  function patchStep(next: WorkflowStepDto) {
    update({ steps: draft.steps.map((item) => item.id === next.id ? next : item) });
  }

  async function persist(nextState: WorkflowRecordDto["state"]) {
    if (busy || active || !draft.name.trim() || (nextState === "active" && issues.length)) return;
    setNotice("");
    try {
      const saved = await save.mutateAsync({ ...draft, name: draft.name.trim(), state: nextState });
      setHistory({ previous: [], draft: saved, next: [] });
      setNotice(nextState === "active" ? "Workflow activated." : "Draft saved.");
      if (!draft.id) router.replace(`/workflows/${saved.id}/edit`);
    } catch {
      // The mutation exposes the error in the editor.
    }
  }

  async function startTest(steps = draft.steps) {
    if (busy) return;
    const [issue] = steps === draft.steps ? testIssues : executionIssues(testName, steps);
    setTestIssue(issue ?? "");
    if (issue) return;
    let id = draft.id;
    try {
      if (!id) {
        const saved = await save.mutateAsync({ ...draft, name: testName, state: "draft" });
        id = saved.id;
        setHistory({ previous: [], draft: saved, next: [] });
      }
      const result = await test.mutateAsync({ id, steps });
      if (!draft.id) {
        router.replace(`/workflows/${id}/runs/${result.id}`);
        return;
      }
      setRunId(result.id);
      setExecutionOpen(true);
    } catch {
      // Keep the draft available for another attempt.
      if (!draft.id && id) router.replace(`/workflows/${id}/edit`);
    }
  }

  async function buildStep(item: WorkflowStepDto) {
    if (!ai.ready || busy || !item.detail.trim() || !buildDatasetIds.length || buildDatasetIds.length > 8) return;
    setNotice("");
    try {
      const result = await ai.build.mutateAsync({
        steps: [{ ...item, config: { ...item.config, script: "", script_for: "", script_dataset_ids: buildDatasetIds } }],
        datasetIds: buildDatasetIds,
      });
      const built = result.steps[0];
      const ready = built && scriptReady(built, buildDatasetIds);
      if (ready) patchStep(built);
      setNotice(result.notes.join(" ") || (ready ? "Custom step built." : "The Custom step could not be built."));
    } catch {
      // The mutation exposes the error in the editor.
    }
  }

  async function requestChanges() {
    const text = instruction.trim();
    if (!text || busy || !ai.ready) return;
    setRequest(text);
    setProposal(null);
    try {
      const context = draft.steps.map(({ kind, title, detail }) => ({ kind, title, detail }));
      const prompt = context.length
        ? `Revise the following workflow in order. Keep steps unrelated to the request.\nCurrent steps: ${JSON.stringify(context).slice(0, 1900)}\nChange request: ${text}`
        : text;
      setProposal(await ai.plan.mutateAsync({ prompt, datasetIds: datasetIdsOf(draft.steps).slice(0, 8) }));
      setInstruction("");
    } catch {
      // Keep the instruction available to retry.
    }
  }

  function applyChanges() {
    if (!proposal) return;
    update({ name: draft.name || proposal.name, steps: proposal.steps, prompt: proposal.prompt, description: proposal.description });
    setSelected(null);
    setProposal(null);
    setNotice("Changes applied to the draft.");
  }

  function fit() {
    if (!canvas.current || !flow.current) return;
    setZoom(Math.min(1, Math.max(0.4, (canvas.current.clientHeight - 12) / flow.current.offsetHeight)));
    canvas.current.scrollTo(0, 0);
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button, [data-workflow-node]")) return;
    const element = event.currentTarget;
    pan.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture?.(event.pointerId);
    setSelected(null);
  }

  function insertControl(label: string, index: number) {
    return (
      <div className="flex flex-col items-center">
        <span className="h-2 w-px bg-border-strong" />
        <button type="button" aria-label={label} aria-haspopup="dialog" disabled={busy || draft.steps.length >= 40} onClick={() => setPicker(index)}
          className="grid size-6 place-items-center rounded-full border bg-surface text-muted-foreground hover:border-slate hover:text-foreground">
          <Plus className="size-3.5" />
        </button>
        <span className="h-2 w-px bg-border-strong" />
      </div>
    );
  }

  function node(id: string, label: string, title: string, icon: React.ReactNode, item?: WorkflowStepDto) {
    const execution = run.data?.results.find((result) => result.step_id === id);
    const incomplete = item && ((item.kind === "script" && !scriptReady(item, scriptDatasetIds(draft.steps, draft.steps.indexOf(item)))) ||
      (item.kind === "data" && !item.config?.connection_id && !attachedIds(item).length) || (item.kind === "ai" && !item.detail.trim()));
    const connectionName = typeof item?.config?.connection_name === "string" ? item.config.connection_name : "";
    const resource = connectionName || (item && attachedIds(item).map((id) => datasets.data?.find((dataset) => dataset.id === id)?.name ?? "Unavailable dataset").join(", "));
    const upstream = item && !resource && ["ai", "condition", "notify"].includes(item.kind) && draft.steps.findIndex((entry) => entry.id === id) > 0;
    return (
      <div data-workflow-node className={cn("relative flex min-w-0 items-center rounded-lg border bg-surface",
        selected === id && "border-slate ring-1 ring-slate/30", incomplete && "border-dashed",
        dropTarget === id && "border-slate ring-2 ring-slate/70", execution?.status === "failed" && "border-destructive")}
        onDragOver={(event) => {
          if (!item || !dragging.current || dragging.current === id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(id);
        }}
        onDrop={(event) => {
          if (!item || !dragging.current) return;
          event.preventDefault();
          move(draft.steps.findIndex((entry) => entry.id === dragging.current), draft.steps.indexOf(item));
          dragging.current = null;
          setDropTarget(null);
        }}>
        {item && <span draggable={!busy} title="Drag to reorder" className="ml-2 cursor-grab text-muted-foreground active:cursor-grabbing"
          onDragStart={(event) => { dragging.current = id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
          onDragEnd={() => { dragging.current = null; setDropTarget(null); }}><GripVertical className="size-4" /></span>}
        <button type="button" aria-label={`${label} ${title}`} aria-pressed={selected === id} onClick={() => select(id)}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg p-2.5 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-raised text-slate">{icon}</span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="block truncate text-sm font-medium">{title}</span>
            {(resource || upstream || incomplete || item?.kind === "human") && <span className="block truncate text-[11px] text-muted-foreground">{item?.kind === "human" ? "Draft only" : incomplete ? "Needs configuration" : resource || "Uses previous output"}</span>}
            {execution && execution.status !== "pending" && <StatusBadge status={execution.status} />}
          </span>
        </button>
        <Button type="button" size="icon" variant="ghost" aria-label={item ? `Delete step: ${title}` : "Delete trigger"}
          disabled={busy} className="mr-2 size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (item) removeStep(id);
            else { update({ trigger: hiddenTrigger }); if (selected === id || triggerView) select(null); }
          }}><Trash2 /></Button>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-4 py-5 sm:px-6">
      <header>
        <Link href="/workflows" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Workflows</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="sr-only">{draft.name || "New workflow"}</h1>
            <input aria-label="Workflow name" placeholder="New workflow" maxLength={160} disabled={busy} value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              className="min-w-24 max-w-md flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xl font-semibold tracking-tight placeholder:text-foreground hover:border-border focus:border-border-strong" />
            <span className="rounded-md border bg-raised px-2 py-0.5 text-xs capitalize text-muted-foreground">{state === "inactive" ? "Paused" : state}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="icon" className="size-8" aria-label="Workflow settings" title="Workflow settings" onClick={() => select(null)}><Settings2 /></Button>
            <Button variant="outline" size="sm" disabled={busy}
              title={draft.id ? "Run the current draft without publishing" : "Save as a draft and run a test"}
              onClick={() => void startTest()}><Play /> Test run</Button>
            <Button variant="outline" size="sm" disabled={busy || active || !draft.name.trim()} onClick={() => void persist(state)}>Save</Button>
            <Button size="sm" disabled={busy || (active ? !draft.id : !!issues.length)}
              title={active ? "Pause the published workflow" : issues[0]}
              onClick={() => {
                if (active && draft.id) setState.mutate({ id: draft.id, state: "inactive" });
                else void persist("active");
              }}>{active ? "Pause" : "Activate"}</Button>
          </div>
        </div>
        {testIssue && (
          <p role="alert" className="mt-2 rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {testIssue}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-surface p-2">
        <Button size="sm" aria-haspopup="dialog" disabled={busy || draft.steps.length >= 40} onClick={() => setPicker(draft.steps.length)}><Plus /> Add step</Button>
        <div className="flex items-center gap-1 border-l pl-1.5">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Undo" title="Undo" disabled={busy || !history.previous.length} onClick={undo}><Undo2 /></Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Redo" title="Redo" disabled={busy || !history.next.length} onClick={redo}><Redo2 /></Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setZoom(1); canvas.current?.scrollTo(0, 0); }}><LayoutList /> Auto layout</Button>
        <Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Toggle right panel" aria-expanded={rightOpen}
          onClick={() => setRightOpen(!rightOpen)}><PanelRight /></Button>
      </div>

      {picker !== null && <WorkflowStepPicker hasTrigger={hasTrigger} onClose={() => setPicker(null)} onPick={(kind) => add(kind, picker)} />}
      {preview && <Dialog open onOpenChange={(open) => { if (!open) setPreviewId(undefined); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="pr-6 text-base font-semibold">{preview.name}</DialogTitle>
          <DialogDescription className="sr-only">Library dataset preview</DialogDescription>
          <div className="mt-3 h-80 min-w-0">
            <DatasetPreview dataset={{ columns: preview.columns, preview_rows: preview.rows, row_count: preview.row_count ?? null, column_count: preview.columns.length }} />
          </div>
        </DialogContent>
      </Dialog>}
      {error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {active && <p className="text-xs text-muted-foreground">Pause the published workflow before saving edits. Tests run the current draft.</p>}

      <div className={cn("grid min-w-0 gap-3", rightOpen && "lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]")}>
        <div className="relative min-w-0 overflow-hidden rounded-xl border bg-background">
          <div ref={canvas} aria-label="Workflow canvas" onPointerDown={startPan}
            onPointerMove={(event) => {
              const start = pan.current;
              if (start) event.currentTarget.scrollTo(start.left - event.clientX + start.x, start.top - event.clientY + start.y);
            }}
            onLostPointerCapture={() => { pan.current = null; }} onPointerUp={() => { pan.current = null; }}
            className="h-[480px] overflow-auto bg-[radial-gradient(var(--border-strong)_0.75px,transparent_0.75px)] [background-size:16px_16px] lg:h-[max(480px,calc(100dvh-268px))]">
            <div ref={flow} className="mx-auto w-[min(90%,360px)] pb-16 pt-7" style={{ zoom }}>
              {hasTrigger && node("trigger", "Trigger", describeSchedule(draft.trigger), <Clock className="size-4" />)}
              {draft.steps.map((item, index) => (
                <div key={item.id}>
                  {draft.steps.length < 40 && insertControl(`Add a step before step ${index + 1}`, index)}
                  {node(item.id, stepLabel(item.kind), item.title || stepLabel(item.kind), <StepIcon kind={item.kind} />, item)}
                  {item.kind === "condition" && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">True continues · False stops</p>}
                </div>
              ))}
              {draft.steps.length < 40 && insertControl("Add a step at the end", draft.steps.length)}
              {!draft.steps.length && !hasTrigger && <p className="mx-auto mt-2 w-fit rounded-md bg-surface px-2 py-1 text-xs text-muted-foreground">Add the first step to start building.</p>}
            </div>
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border bg-surface p-0.5">
            <Button size="icon" variant="ghost" aria-label="Zoom out" className="size-7" disabled={zoom <= 0.4} onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}><Minus /></Button>
            <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" aria-label="Zoom in" className="size-7" disabled={zoom >= 1.5} onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}><Plus /></Button>
            <Button size="icon" variant="ghost" aria-label="Fit view" className="size-7" onClick={fit}><Maximize /></Button>
          </div>
        </div>

        {rightOpen && <aside className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface lg:h-[max(480px,calc(100dvh-268px))]">
          <div role="tablist" aria-label="Workflow inspector" className="grid shrink-0 grid-cols-2 border-b">
            {tabs.map((value) => (
              <button key={value} type="button" role="tab" id={`workflow-tab-${tabs.indexOf(value)}`} aria-controls="workflow-inspector-panel"
                aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const next = (tabs.indexOf(value) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
                  setTab(tabs[next]);
                  document.getElementById(`workflow-tab-${next}`)?.focus();
                }}
                className={cn("h-10 border-b-2 border-transparent text-xs text-muted-foreground hover:text-foreground", tab === value && "border-slate font-semibold text-foreground")}>{value}</button>
            ))}
          </div>
          <div id="workflow-inspector-panel" role="tabpanel" aria-labelledby={`workflow-tab-${tabs.indexOf(tab)}`}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {tab === "Configuration" && (
              <div className="space-y-4 p-4">
                {triggerView === "choose" ? (
                  <TriggerChooser onSelect={configureTrigger} onBack={() => setTriggerView(null)} disabled={busy} />
                ) : triggerView === "webhook" || (selected === "trigger" && hasTrigger) ? (
                  <TriggerConfiguration trigger={draft.trigger} webhook={triggerView === "webhook"}
                    onChange={(trigger) => update({ trigger })} onBack={() => setTriggerView("choose")} disabled={busy} />
                ) : step ? <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{stepLabel(step.kind)}</h2>
                    <div className="flex">
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`Duplicate ${step.title}`} disabled={busy || draft.steps.length >= 40}
                        onClick={() => {
                          const copy = { ...step, id: newStepId() };
                          update({ steps: [...draft.steps.slice(0, stepIndex + 1), copy, ...draft.steps.slice(stepIndex + 1)] });
                          select(copy.id);
                        }}><Copy /></Button>
                      <StepActions name={step.title} first={busy || stepIndex === 0} last={busy || stepIndex === draft.steps.length - 1}
                        onMove={(by) => move(stepIndex, stepIndex + by)} onRemove={() => { if (!busy) removeStep(step.id); }} />
                    </div>
                  </div>
                  <fieldset className="min-w-0" disabled={busy}>
                    <StepEditor key={step.id} step={step} datasets={datasets.data ?? []} loading={datasets.isLoading} models={ai.models}
                      onChange={patchStep} onBuild={() => void buildStep(step)} canBuild={ai.ready && !busy}
                      buildDatasetCount={buildDatasetIds.length} />
                  </fieldset>
                  {step.kind === "ai" && <div className="space-y-2">
                    <Button type="button" variant="outline" size="sm" disabled={busy}
                      onClick={() => void startTest(draft.steps.slice(0, stepIndex + 1))}><Play /> Test AI step</Button>
                    {stepIndex > 0 && <p className="text-xs text-muted-foreground">Runs the preceding steps for input and stops after this AI step.</p>}
                    {runningStep && <WorkflowStepProgress step={runningStep} />}
                  </div>}
                </> : <>
                  <h2 className="text-sm font-semibold">Workflow settings</h2>
                  <label className="block space-y-1 text-xs text-muted-foreground">Description
                    <textarea rows={3} maxLength={2000} disabled={busy} value={draft.description}
                      onChange={(event) => update({ description: event.target.value })} className={inputClass} />
                  </label>
                  {allDatasets.length > 0 && <details className="rounded-md border p-2.5 text-xs">
                    <summary className="cursor-pointer font-medium">Datasets</summary>
                    <ul className="mt-2 divide-y">
                      {allDatasets.map((id) => {
                        const dataset = datasets.data?.find((item) => item.id === id);
                        const steps = draft.steps.filter((item) => attachedIds(item).includes(id));
                        return <li key={id} className="space-y-1 py-2">
                          <span className="flex items-center gap-2"><Database className="size-3.5 text-slate" />{dataset?.name ?? "Unavailable dataset"}</span>
                          {dataset && <div className="flex items-center justify-between gap-2 text-muted-foreground">
                            <span>{dataset.columns.length} columns · {dataset.row_count ?? dataset.rows.length} rows</span>
                            <button type="button" onClick={() => setPreviewId(id)} className="hover:underline">Preview</button>
                          </div>}
                          <div className="flex flex-wrap gap-1">{steps.map((item) => (
                            <button key={item.id} type="button" onClick={() => select(item.id)} className="rounded border px-1.5 py-0.5 hover:bg-raised">{item.title}</button>
                          ))}</div>
                        </li>;
                      })}
                    </ul>
                  </details>}
                  {issues.length > 0 && <div className="space-y-1 text-xs text-muted-foreground"><p className="font-medium">Before activation</p>
                    <ul className="list-disc space-y-1 pl-4">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
                </>}
              </div>
            )}
            {tab === "AI Assistant" && (
              <div className="flex min-h-full flex-col justify-between gap-3 p-4 text-xs">
                <div className="space-y-3">
                  {(request || draft.prompt) && <p className="ml-3 whitespace-pre-wrap rounded-lg bg-raised p-3 leading-relaxed">{request || draft.prompt}</p>}
                  {proposal ? (
                    <div className="rounded-lg border p-3">
                      <h2 className="font-semibold">Proposed changes</h2>
                      <p className="mt-1 text-muted-foreground">Review the proposed step sequence. Applying it replaces the current steps.</p>
                      <ol className="my-2 list-decimal space-y-1 pl-4 text-muted-foreground">{proposal.steps.map((item) => <li key={item.id}>{item.title} · {stepLabel(item.kind)}</li>)}</ol>
                      <Button size="sm" variant="outline" disabled={busy} onClick={applyChanges}>Apply changes</Button>
                      <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>Discard</Button>
                    </div>
                  ) : <p className="text-muted-foreground">{ai.ready ? "Describe the workflow or a change to its steps." : "No AI model is available."}</p>}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void requestChanges(); }} className="rounded-lg border bg-background p-2">
                  <textarea aria-label="Ask AI to modify the workflow" placeholder="Ask AI to modify the workflow…" rows={2} maxLength={2000}
                    value={instruction} onChange={(event) => setInstruction(event.target.value)} className="w-full resize-y bg-transparent px-1 outline-none" />
                  <div className="flex justify-end"><Button type="submit" size="icon" className="size-7" disabled={!instruction.trim() || !ai.ready || busy} aria-label="Propose changes"><ArrowUp /></Button></div>
                </form>
              </div>
            )}
          </div>
        </aside>}
      </div>
      <WorkflowExecutionInspector workflowId={draft.id} open={executionOpen} onToggle={() => setExecutionOpen(!executionOpen)} run={run.data} />
      {!active && issues.length > 0 && !testIssue && <p className="text-xs text-muted-foreground">{testIssues[0] ?? issues[0]}</p>}
    </section>
  );
}
