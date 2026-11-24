"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import type { WorkflowStepDto, WorkflowStepKind, WorkflowTriggerDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DatasetPicker } from "@/features/dashboards/components/dataset-picker";
import { useDashboardDatasets } from "@/features/dashboards/use-dashboards";
import { datasetIdsOf, makeTrigger, needsScript, newStep, problems, promptSteps } from "../logic/steps";
import { TEMPLATES, templateToDraft } from "../logic/templates";
import { useSaveWorkflow, useWorkflow, useWorkflowAi } from "../use-workflows";
import { Connector, StepCard, TriggerCard } from "./flow-parts";
import { SchedulePicker } from "./schedule-picker";
import { StepActions, StepEditor } from "./step-editor";

type Mode = "describe" | "build";
const messageOf = (error: unknown) => (error instanceof ApiError || error instanceof Error ? error.message : error ? "Something went wrong." : "");

/**
 * One page, two ways in. "Describe it": write what you want, let the AI sharpen it, pick data and a schedule; the same
 * question runs every time. "Build it": lay the steps out vertically like n8n/Zapier, then let the AI write the Python.
 */
export function WorkflowBuilderPage({ workflowId }: { workflowId?: string }) {
  const router = useRouter();
  const templateId = useSearchParams().get("template");
  const template = TEMPLATES.find((item) => item.id === templateId);
  const existing = useWorkflow(workflowId ?? "new");
  const datasetsQuery = useDashboardDatasets();
  const datasets = datasetsQuery.data ?? [];
  const ai = useWorkflowAi();
  const save = useSaveWorkflow();

  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("describe");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [trigger, setTrigger] = useState<WorkflowTriggerDto>(makeTrigger("daily"));
  const [picked, setPicked] = useState<string[]>([]);
  const [steps, setSteps] = useState<WorkflowStepDto[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [state, setState] = useState<"draft" | "active" | "inactive">("draft");

  useEffect(() => {
    if (loaded) return;
    if (workflowId && existing.data) {
      const item = existing.data;
      setName(item.name); setDescription(item.description); setPrompt(item.prompt); setTrigger(item.trigger); setSteps(item.steps); setState(item.state);
      setPicked(datasetIdsOf(item.steps)); setMode("build"); setLoaded(true);
    } else if (!workflowId) {
      if (template) {
        const draft = templateToDraft(template);
        setName(draft.name); setDescription(draft.description); setPrompt(draft.prompt); setTrigger(draft.trigger); setSteps(draft.steps); setMode("build");
        setNotes(["Imported from a template. Choose your data in the first step, then press “Build with AI” to write the scripts."]);
      }
      setLoaded(true);
    }
  }, [loaded, workflowId, existing.data, template]);

  const described = useMemo(() => promptSteps(prompt.trim(), picked), [prompt, picked]);
  const flowSteps = mode === "describe" ? described : steps;
  const issues = useMemo(() => problems(name, mode === "describe" ? promptSteps(prompt.trim() || "…", picked) : steps), [name, mode, prompt, picked, steps]);
  const busy = ai.plan.isPending || ai.build.isPending || ai.rephrase.isPending || save.isPending;
  const error = messageOf(ai.plan.error ?? ai.build.error ?? ai.rephrase.error ?? save.error);

  const togglePicked = (id: string) => setPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  const updateStep = (next: WorkflowStepDto) => setSteps(steps.map((step) => (step.id === next.id ? next : step)));
  const insertAt = (index: number, kind: WorkflowStepKind) => {
    const step = newStep(kind, kind === "data" ? picked : []);
    setSteps([...steps.slice(0, index), step, ...steps.slice(index)]); setOpen(step.id);
  };
  const move = (index: number, by: -1 | 1) => { const next = [...steps]; [next[index], next[index + by]] = [next[index + by], next[index]]; setSteps(next); };

  const rephrase = async () => { const text = await ai.rephrase.mutateAsync({ prompt, datasetIds: picked }).catch(() => null); if (text) setPrompt(text); };
  const plan = async () => {
    const result = await ai.plan.mutateAsync({ prompt, datasetIds: picked }).catch(() => null);
    if (!result) return;
    setSteps(result.steps); setPrompt(result.prompt); setName((current) => current || result.name); setDescription((current) => current || result.description);
    setMode("build"); setNotes(["The AI turned your request into these steps. Change anything, then Save."]);
  };
  const buildScripts = async (current: WorkflowStepDto[]) => {
    const ids = datasetIdsOf(current);
    if (!ids.length) { setNotes(["Choose a dataset in the “Get data” step first, so the script can be tested on real data."]); return current; }
    const result = await ai.build.mutateAsync({ steps: current, datasetIds: ids }).catch(() => null);
    if (!result) return current;
    setSteps(result.steps); setNotes(result.notes.length ? result.notes : ["Every script is already up to date."]);
    return result.steps;
  };

  const finish = async (turnOn: boolean) => {
    let finalSteps = mode === "describe" ? promptSteps(prompt.trim(), picked) : steps;
    if (finalSteps.some(needsScript) || finalSteps.some((step) => step.kind === "script" && step.config?.script_for !== step.detail)) finalSteps = await buildScripts(finalSteps);
    const saved = await save.mutateAsync({ id: workflowId, name: name.trim(), description: description.trim(), prompt: prompt.trim(), state: turnOn ? "active" : state, trigger, steps: finalSteps }).catch(() => null);
    if (saved) router.push(`/workflows/${saved.id}`);
  };

  if (workflowId && existing.isError) return <p className="p-8 text-sm text-muted-foreground">This workflow could not be found.</p>;
  if (workflowId && !loaded) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href={workflowId ? `/workflows/${workflowId}` : "/workflows"} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{workflowId ? "Back to the workflow" : "All workflows"}</Link>
      <h1 className="text-xl font-semibold tracking-tight">{workflowId ? "Edit workflow" : "New workflow"}</h1>
      <p className="mt-1 text-xs text-muted-foreground">A workflow runs by itself on a schedule. Tell the AI what you want, or lay the steps out yourself.</p>

      <label className="mt-6 block"><span className="mb-1 block text-xs font-medium">Name</span>
        <input aria-label="Workflow name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Daily sales summary" className="h-10 w-full rounded-md border bg-surface px-3 text-sm outline-none focus:border-border-strong" /></label>

      <div role="tablist" aria-label="How to create it" className="mt-6 grid w-full grid-cols-2 gap-1 rounded-lg border bg-surface p-1 sm:w-fit">
        {([["describe", "Describe it", Sparkles], ["build", "Build it step by step", Wand2]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground", mode === value && "bg-raised text-foreground shadow-sm")}><Icon className="size-3.5" />{label}</button>
        ))}
      </div>

      {mode === "describe" ? (
        <div className="mt-4 grid gap-5">
          <div>
            <label htmlFor="wf-prompt" className="mb-1 block text-xs font-medium">What should it do each time?</label>
            <textarea id="wf-prompt" value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Tell me which region sold the most and whether any order looks unusual." className="w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy || !ai.ready || prompt.trim().length < 3} onClick={() => void rephrase()}>{ai.rephrase.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}Rephrase with AI</Button>
              <Button type="button" variant="outline" size="sm" disabled={busy || !ai.ready || prompt.trim().length < 3} onClick={() => void plan()}>{ai.plan.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}Show it as steps</Button>
            </div>
          </div>
          <div><span className="mb-1 block text-xs font-medium">Which data?</span><DatasetPicker datasets={datasets} loading={datasetsQuery.isLoading} selected={picked} onToggle={togglePicked} /></div>
        </div>
      ) : null}

      <div className="mt-6"><span className="mb-1 block text-xs font-medium">When should it run?</span><SchedulePicker trigger={trigger} onChange={setTrigger} /></div>

      <div className="mt-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">The flow</h2>
        <div className="mx-auto max-w-xl" aria-label="Workflow flow">
          <TriggerCard trigger={trigger} />
          {flowSteps.map((step, index) => (
            <div key={step.id}>
              <Connector onAdd={mode === "build" ? (kind) => insertAt(index, kind) : undefined} label={`Add a step before step ${index + 1}`} />
              <StepCard index={index} step={step} tone={open === step.id ? "active" : undefined}
                actions={mode === "build" ? (
                  <>
                    <button type="button" aria-label={`Edit ${step.title}`} aria-expanded={open === step.id} onClick={() => setOpen(open === step.id ? null : step.id)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground"><Pencil className="size-3.5" /></button>
                    <StepActions name={step.title} first={index === 0} last={index === flowSteps.length - 1} onMove={(by) => move(index, by)} onRemove={() => setSteps(steps.filter((item) => item.id !== step.id))} />
                  </>
                ) : null}>
                {mode === "build" && open === step.id ? <StepEditor step={step} datasets={datasets} loading={datasetsQuery.isLoading} onChange={updateStep} /> : null}
              </StepCard>
            </div>
          ))}
          {mode === "build" ? (
            <>
              <Connector onAdd={(kind) => insertAt(steps.length, kind)} label="Add a step at the end" />
              {!steps.length ? <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">Press + to add the first step, usually “Get data”.</p> : null}
            </>
          ) : <p className="mt-4 text-center text-[11px] text-muted-foreground">These three steps run in order every time. Want more control? Use “Build it step by step”.</p>}
        </div>
      </div>

      {notes.length ? <ul aria-label="AI notes" className="mt-5 grid gap-1 rounded-lg border border-sky-300/30 bg-sky-300/5 p-3 text-xs">{notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
      {error ? <p role="alert" className="mt-5 rounded-lg border border-rose-400/40 bg-rose-400/5 p-3 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-5">
        {mode === "build" ? <Button type="button" variant="outline" disabled={busy || !ai.ready || !steps.some((step) => step.kind === "script")} onClick={() => void buildScripts(steps)}>{ai.build.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}Build with AI</Button> : null}
        <Button type="button" variant="outline" disabled={busy || issues.length > 0} onClick={() => void finish(false)}>{save.isPending ? <Loader2 className="animate-spin" /> : null}Save</Button>
        <Button type="button" disabled={busy || issues.length > 0} onClick={() => void finish(true)}>Save and turn on</Button>
        <Link href={workflowId ? `/workflows/${workflowId}` : "/workflows"} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Cancel</Link>
      </div>
      {issues.length ? <ul aria-label="To finish" className="mt-3 grid gap-0.5 text-[11px] text-muted-foreground">{issues.map((issue) => <li key={issue}>• {issue}</li>)}</ul> : null}
    </section>
  );
}
