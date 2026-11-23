"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, FlaskConical, GripVertical, Plus, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateFromDescription, generateFromSketch, type SketchBox } from "../logic/generate-workflow";
import { useSaveWorkflow, useWorkflow } from "../use-workflows";
import { stepProblem, testRun } from "../logic/step-config";
import type { GeneratedWorkflow, RunView, Workflow, WorkflowStep, WorkflowTrigger } from "../types";
import { StatusBadge } from "./workflow-parts";
import { ConfigPanel, insertStep, WorkflowCanvas, type Selection } from "./workflow-canvas";

const field = "h-9 rounded-md border bg-surface px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong";

function SketchCanvas({ boxes, onChange }: { boxes: SketchBox[]; onChange: (boxes: SketchBox[]) => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  function startDrag(event: ReactPointerEvent<HTMLElement>, id: string) {
    const area = canvas.current?.getBoundingClientRect();
    const box = boxes.find((item) => item.id === id);
    if (!area || !box) return;
    event.preventDefault();
    const offsetX = event.clientX - area.left - box.x;
    const offsetY = event.clientY - area.top - box.y;
    const move = (moveEvent: PointerEvent) => {
      const x = Math.min(Math.max(0, moveEvent.clientX - area.left - offsetX), area.width - 150);
      const y = Math.min(Math.max(0, moveEvent.clientY - area.top - offsetY), area.height - 56);
      onChange(boxes.map((item) => (item.id === id ? { ...item, x, y } : item)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  return (
    <div>
      <div ref={canvas} className="relative h-72 overflow-hidden rounded-lg border bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]" aria-label="Sketch canvas">
        {boxes.length === 0 ? <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted-foreground">Add boxes and name each step. Drag them into the order you imagine; the builder straightens them into a linear workflow.</p> : null}
        {boxes.map((box) => (
          <div key={box.id} style={{ left: box.x, top: box.y }} className="absolute flex w-[150px] items-center gap-1 rounded-md border bg-surface p-1 shadow-sm">
            <span role="img" aria-label="Drag box" onPointerDown={(event) => startDrag(event, box.id)} className="grid size-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground active:cursor-grabbing"><GripVertical className="size-3.5" /></span>
            <input aria-label="Box text" value={box.text} onChange={(event) => onChange(boxes.map((item) => (item.id === box.id ? { ...item, text: event.target.value } : item)))} placeholder="Name this step" className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
            <button type="button" aria-label="Remove box" onClick={() => onChange(boxes.filter((item) => item.id !== box.id))} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-3" /></button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onChange([...boxes, { id: `box-${Date.now().toString(36)}-${boxes.length}`, text: "", x: 16 + (boxes.length % 3) * 160, y: 16 + Math.floor(boxes.length / 3) * 80 }])}><Plus />Add box</Button>
    </div>
  );
}

interface BuilderFormProps { initial?: Workflow }

function BuilderForm({ initial }: BuilderFormProps) {
  const router = useRouter();
  const save = useSaveWorkflow();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [trigger, setTrigger] = useState<WorkflowTrigger>(initial?.trigger ?? { kind: "manual", label: "Run manually" });
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? []);
  const [enabled, setEnabled] = useState(initial?.state === "active");
  const [selected, setSelected] = useState<Selection>("trigger");
  const [mode, setMode] = useState<"describe" | "sketch">("describe");
  const [prompt, setPrompt] = useState("");
  const [boxes, setBoxes] = useState<SketchBox[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [test, setTest] = useState<RunView | null>(null);

  function apply(result: GeneratedWorkflow) {
    setName((current) => current || result.name);
    setDescription(result.description);
    setTrigger(result.trigger);
    setSteps(result.steps);
    setNotes(result.notes);
    setSelected("trigger");
    setTest(null);
  }
  const edited = () => setTest(null);
  const move = (id: string, delta: number) => { edited(); setSteps((current) => {
    const index = current.findIndex((step) => step.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }); };
  const update = (id: string, patch: Partial<WorkflowStep>) => { edited(); setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step))); };
  const incomplete = steps.filter((step) => stepProblem(step));
  const canSave = name.trim().length > 0 && steps.length > 0 && steps.every((step) => step.title.trim());
  const canEnable = steps.length > 0 && incomplete.length === 0;

  function submit() {
    save.mutate({ id: initial?.id, name, description, trigger, steps, state: enabled && canEnable ? "active" : initial?.state === "inactive" && !enabled ? "inactive" : "draft" }, { onSuccess: (saved) => router.push(`/workflows/${saved.id}`) });
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
        <Link href={initial ? `/workflows/${initial.id}` : "/workflows"} className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />{initial ? "Back to workflow" : "Workflows"}</Link>
      </nav>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{initial ? "Edit workflow" : "Create workflow"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Pick a trigger, add steps with the + buttons, and click any card to set it up.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" role="switch" aria-checked={enabled} aria-label="Workflow enabled" disabled={!canEnable} title={canEnable ? undefined : "Finish every step to turn it on"} onClick={() => setEnabled(!enabled)} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs disabled:opacity-50">
            <span className={cn("relative h-4 w-7 rounded-full transition-colors", enabled ? "bg-sage" : "bg-border-strong")}><span className={cn("absolute top-0.5 size-3 rounded-full bg-background transition-all", enabled ? "left-3.5" : "left-0.5")} /></span>
            {enabled ? "On" : "Off"}
          </button>
          <Button type="button" variant="outline" disabled={!steps.length} onClick={() => setTest(testRun({ trigger, steps }))}><FlaskConical />Test workflow</Button>
          <Button onClick={submit} disabled={!canSave || save.isPending} title={canSave ? undefined : "Add a name and at least one step"}><Save />{save.isPending ? "Saving…" : "Save workflow"}</Button>
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 text-xs font-medium">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly revenue report" className={cn(field, "mt-1.5 w-full")} /></label>
        <label className="block min-w-0 text-xs font-medium">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What it is for" className={cn(field, "mt-1.5 w-full")} /></label>
      </div>

      <details className="mt-4 rounded-lg border bg-surface/40 p-3" open={steps.length === 0}>
        <summary className="cursor-pointer text-xs font-medium"><Sparkles className="mr-1.5 inline size-3.5" />Start from a description or sketch</summary>
        <div className="mt-3 space-y-3">
          <div role="tablist" aria-label="How to start" className="flex w-fit rounded-lg border bg-surface p-1">
            {([["describe", "Describe"], ["sketch", "Sketch"]] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={cn("h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground", mode === value && "bg-raised text-foreground shadow-sm")}>{label}</button>
            ))}
          </div>
          {mode === "describe" ? (
            <div>
              <label htmlFor="workflow-prompt" className="text-xs font-medium">What should this workflow do?</label>
              <textarea id="workflow-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Every Monday at 9am, pull last week's revenue, analyze trends, build a chart and email the team." className="mt-2 w-full resize-y rounded-lg border bg-surface p-3 text-xs leading-5 outline-none placeholder:text-muted-foreground focus:border-border-strong" />
              <Button type="button" className="mt-2" disabled={!prompt.trim()} onClick={() => apply(generateFromDescription(prompt))}><Sparkles />Generate workflow</Button>
            </div>
          ) : (
            <div>
              <SketchCanvas boxes={boxes} onChange={setBoxes} />
              <Button type="button" className="mt-2" disabled={!boxes.some((box) => box.text.trim())} onClick={() => apply(generateFromSketch(boxes))}><Sparkles />Build workflow from sketch</Button>
            </div>
          )}
          {notes.length ? (
            <aside aria-label="What the builder did" className="rounded-lg border bg-surface/50 p-3 text-xs">
              <p className="font-medium">What the builder did</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
            </aside>
          ) : null}
          <p className="text-[11px] text-muted-foreground">A rule-based reader turns your text or sketch into steps; it does not call a model yet.</p>
        </div>
      </details>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <WorkflowCanvas trigger={trigger} steps={steps} selected={selected} statuses={test ? Object.fromEntries(test.steps.map((item) => [item.step_id, item.status])) : undefined}
            onSelect={setSelected} onInsert={(index, kind) => { edited(); const result = insertStep(steps, index, kind); setSteps(result.steps); setSelected(result.added.id); }} />
          {incomplete.length ? <p className="mt-3 text-center text-[11px] text-amber-200">{incomplete.length} step{incomplete.length > 1 ? "s need" : " needs"} setup before the workflow can be turned on.</p> : null}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-surface/40 p-4">
            <ConfigPanel trigger={trigger} steps={steps} selected={selected} onTrigger={(next) => { edited(); setTrigger(next); }} onStep={update} onMove={move}
              onDelete={(id) => { edited(); setSteps((current) => current.filter((step) => step.id !== id)); setSelected("trigger"); }} />
          </div>
          {test ? (
            <section aria-label="Test results" className="rounded-xl border bg-surface/40 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">Test result <StatusBadge status={test.status} /></h2>
              <pre className="mt-2 max-h-56 overflow-auto font-mono text-[11px] leading-5 text-muted-foreground">{test.steps.flatMap((item) => item.log.map((line) => `[${item.title}] ${line}`)).join("\n")}</pre>
              <p className="mt-2 text-[11px] text-muted-foreground">Simulated test: no data is read and nothing is sent.</p>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function WorkflowBuilderPage({ workflowId }: { workflowId?: string }) {
  const query = useWorkflow(workflowId ?? "");
  if (!workflowId) return <BuilderForm />;
  if (query.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading workflow…</p>;
  if (!query.data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Workflow not found</h1>
        <Button asChild variant="outline" className="mt-5"><Link href="/workflows"><ArrowLeft />Back to workflows</Link></Button>
      </section>
    );
  }
  return <BuilderForm key={query.data.id} initial={query.data} />;
}
