"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, Plus, Trash2, Zap } from "lucide-react";
import { getLibrary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { newStep } from "../logic/generate-workflow";
import { EVENTS, FREQUENCIES, KIND_LABEL, OPERATORS, WEEKDAYS, scheduleLabel, stepProblem, stepSummary, triggerWithConfig } from "../logic/step-config";
import type { StepKind, StepStatus, TriggerKind, WorkflowStep, WorkflowTrigger } from "../types";
import { StatusBadge, stepIcon, triggerIcon } from "./workflow-parts";

const field = "h-9 w-full rounded-md border bg-surface px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong";
const KINDS = Object.keys(KIND_LABEL) as StepKind[];
export type Selection = "trigger" | string;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium">{label}<span className="mt-1.5 block">{children}</span></label>;
}

interface CanvasProps {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
  onInsert: (index: number, kind: StepKind) => void;
  statuses?: Record<string, StepStatus>;
}

function Connector({ index, open, onToggle, onPick }: { index: number; open: boolean; onToggle: () => void; onPick: (kind: StepKind) => void }) {
  return (
    <div className="relative flex flex-col items-center">
      <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
      <button type="button" aria-label={`Add step at position ${index + 1}`} aria-expanded={open} onClick={onToggle} className="grid size-6 place-items-center rounded-full border border-border-strong bg-surface text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"><Plus className="size-3.5" /></button>
      <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
      {open ? (
        <div role="menu" aria-label="Choose a step type" className="absolute left-1/2 top-9 z-20 w-56 -translate-x-1/2 rounded-lg border border-border-strong bg-raised p-1.5 shadow-2xl">
          {KINDS.map((kind) => {
            const Icon = stepIcon[kind];
            return <button key={kind} role="menuitem" type="button" onClick={() => onPick(kind)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface"><Icon className="size-4 text-muted-foreground" />{KIND_LABEL[kind]}</button>;
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Zapier-style vertical flow: trigger card, step cards, and a "+" between each pair to insert a step. */
export function WorkflowCanvas({ trigger, steps, selected, onSelect, onInsert, statuses }: CanvasProps) {
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const TriggerIcon = triggerIcon[trigger.kind];

  return (
    <ol aria-label="Workflow canvas" className="mx-auto flex w-full max-w-sm flex-col items-stretch">
      <li>
        <button type="button" onClick={() => onSelect("trigger")} aria-pressed={selected === "trigger"} className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-border-strong", selected === "trigger" && "border-slate ring-1 ring-slate/40")}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-300/15 text-amber-200"><TriggerIcon className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">Trigger</span>
            <span className="block truncate text-xs font-medium">{trigger.kind === "manual" ? "Run manually" : trigger.label}</span>
          </span>
          {statuses?.trigger ? <StatusBadge status={statuses.trigger} /> : null}
        </button>
      </li>
      {steps.map((step, index) => {
        const Icon = stepIcon[step.kind];
        const problem = stepProblem(step);
        return (
          <li key={step.id} className="flex flex-col">
            <Connector index={index} open={menuAt === index} onToggle={() => setMenuAt(menuAt === index ? null : index)} onPick={(kind) => { onInsert(index, kind); setMenuAt(null); }} />
            <button type="button" onClick={() => onSelect(step.id)} aria-pressed={selected === step.id} className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-border-strong", selected === step.id && "border-slate ring-1 ring-slate/40", statuses?.[step.id] === "success" && "border-sage/50", statuses?.[step.id] === "failed" && "border-red-400/60")}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-slate"><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">Step {index + 1} · {KIND_LABEL[step.kind]}</span>
                <span className="block truncate text-xs font-medium">{step.title || "Untitled step"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{stepSummary(step)}</span>
              </span>
              {statuses?.[step.id] ? <StatusBadge status={statuses[step.id]} /> : problem ? <span title={problem} className="text-amber-300"><AlertCircle className="size-4" aria-label={problem} /></span> : null}
            </button>
          </li>
        );
      })}
      <li className="flex flex-col"><Connector index={steps.length} open={menuAt === steps.length} onToggle={() => setMenuAt(menuAt === steps.length ? null : steps.length)} onPick={(kind) => { onInsert(steps.length, kind); setMenuAt(null); }} /></li>
    </ol>
  );
}

interface PanelProps {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  selected: Selection;
  onTrigger: (trigger: WorkflowTrigger) => void;
  onStep: (id: string, patch: Partial<WorkflowStep>) => void;
  onMove: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}

export function ConfigPanel({ trigger, steps, selected, onTrigger, onStep, onMove, onDelete }: PanelProps) {
  const library = useQuery({ queryKey: ["workflow-datasets"], queryFn: async () => (await getLibrary()).items.filter((item) => item.resource_type === "dataset") });

  if (selected === "trigger") {
    const config = trigger.config ?? {};
    const setConfig = (patch: Record<string, string>) => onTrigger(triggerWithConfig(trigger.kind, { ...config, ...patch }));
    return (
      <div className="space-y-4" aria-label="Trigger settings">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Zap className="size-4 text-amber-200" />Trigger</h2>
        <p className="text-[11px] text-muted-foreground">What starts this workflow.</p>
        <Field label="Start when">
          <select aria-label="Trigger type" value={trigger.kind} onChange={(event) => onTrigger(triggerWithConfig(event.target.value as TriggerKind, config))} className={field}>
            <option value="manual">I run it manually</option><option value="schedule">On a schedule</option><option value="event">When something happens</option>
          </select>
        </Field>
        {trigger.kind === "schedule" ? (
          <>
            <Field label="Frequency"><select aria-label="Frequency" value={config.frequency ?? "daily"} onChange={(event) => setConfig({ frequency: event.target.value })} className={field}>{FREQUENCIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></Field>
            {config.frequency === "weekly" ? <Field label="Day"><select aria-label="Day" value={config.day ?? "Monday"} onChange={(event) => setConfig({ day: event.target.value })} className={field}>{WEEKDAYS.map((day) => <option key={day}>{day}</option>)}</select></Field> : null}
            {config.frequency === "monthly" ? <Field label="Day of month"><input aria-label="Day of month" type="number" min={1} max={28} value={config.day_of_month ?? "1"} onChange={(event) => setConfig({ day_of_month: event.target.value })} className={field} /></Field> : null}
            {config.frequency !== "hourly" ? <Field label="Time"><input aria-label="Time" type="time" value={config.time ?? "09:00"} onChange={(event) => setConfig({ time: event.target.value })} className={field} /></Field> : null}
            <p className="text-[11px] text-muted-foreground">Runs: {scheduleLabel(config)}</p>
          </>
        ) : null}
        {trigger.kind === "event" ? <Field label="Event"><select aria-label="Event" value={config.event ?? EVENTS[0]} onChange={(event) => setConfig({ event: event.target.value })} className={field}>{EVENTS.map((value) => <option key={value}>{value}</option>)}</select></Field> : null}
      </div>
    );
  }

  const index = steps.findIndex((step) => step.id === selected);
  const step = steps[index];
  if (!step) return <p className="text-xs text-muted-foreground">Select the trigger or a step to edit it.</p>;
  const config = step.config ?? {};
  const setConfig = (patch: Record<string, string>) => onStep(step.id, { config: { ...config, ...patch } });
  const problem = stepProblem(step);

  return (
    <div className="space-y-4" aria-label="Step settings">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Step {index + 1} · {KIND_LABEL[step.kind]}</h2>
        <span className="flex">
          <button type="button" aria-label="Move step up" disabled={index === 0} onClick={() => onMove(step.id, -1)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
          <button type="button" aria-label="Move step down" disabled={index === steps.length - 1} onClick={() => onMove(step.id, 1)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
          <button type="button" aria-label="Delete step" onClick={() => onDelete(step.id)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-red-300"><Trash2 className="size-3.5" /></button>
        </span>
      </div>
      {problem ? <p role="status" className="flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[11px] text-amber-200"><AlertCircle className="size-3.5" />{problem}</p> : null}
      <Field label="Title"><input aria-label="Step title" value={step.title} onChange={(event) => onStep(step.id, { title: event.target.value })} className={field} /></Field>
      <Field label="Type"><select aria-label="Step type" value={step.kind} onChange={(event) => onStep(step.id, { kind: event.target.value as StepKind, config: {} })} className={field}>{KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></Field>

      {step.kind === "query" ? (
        <>
          <Field label="Data source"><select aria-label="Data source" value={config.source ?? "library"} onChange={(event) => setConfig({ source: event.target.value })} className={field}><option value="library">Library dataset</option><option value="drive">Google Drive</option></select></Field>
          {config.source === "drive"
            ? <Field label="Drive folder or file name"><input aria-label="Drive folder" value={config.drive_folder ?? ""} onChange={(event) => setConfig({ drive_folder: event.target.value })} placeholder="DSAI Test Folder" className={field} /></Field>
            : <Field label="Dataset"><select aria-label="Dataset" value={config.dataset_id ?? ""} onChange={(event) => setConfig({ dataset_id: event.target.value, dataset_name: library.data?.find((item) => item.id === event.target.value)?.name ?? "" })} className={field}><option value="">Choose a dataset…</option>{library.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
        </>
      ) : null}
      {step.kind === "chart" ? (
        <>
          <Field label="Chart type"><select aria-label="Chart type" value={config.chart_type ?? "Auto"} onChange={(event) => setConfig({ chart_type: event.target.value })} className={field}>{["Auto", "Bar", "Line", "Area", "Pie"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Group by (column)"><input aria-label="Group by" value={config.group_by ?? ""} onChange={(event) => setConfig({ group_by: event.target.value })} placeholder="region" className={field} /></Field>
        </>
      ) : null}
      {step.kind === "report" ? <Field label="Format"><select aria-label="Report format" value={config.format ?? "PDF"} onChange={(event) => setConfig({ format: event.target.value })} className={field}>{["PDF", "Markdown", "Dashboard"].map((value) => <option key={value}>{value}</option>)}</select></Field> : null}
      {step.kind === "notify" ? (
        <>
          <Field label="Channel"><select aria-label="Channel" value={config.channel ?? "Email"} onChange={(event) => setConfig({ channel: event.target.value })} className={field}>{["Email", "Slack", "In-app"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Send to"><input aria-label="Recipient" value={config.recipient ?? ""} onChange={(event) => setConfig({ recipient: event.target.value })} placeholder="team@company.com" className={field} /></Field>
        </>
      ) : null}
      {step.kind === "condition" ? (
        <>
          <Field label="Column or metric"><input aria-label="Condition field" value={config.field ?? ""} onChange={(event) => setConfig({ field: event.target.value })} placeholder="revenue" className={field} /></Field>
          <Field label="Operator"><select aria-label="Operator" value={config.operator ?? OPERATORS[0]} onChange={(event) => setConfig({ operator: event.target.value })} className={field}>{OPERATORS.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Value"><input aria-label="Condition value" value={config.value ?? ""} onChange={(event) => setConfig({ value: event.target.value })} className={field} /></Field>
        </>
      ) : null}
      <Field label={step.kind === "analyze" ? "What should the AI do?" : "Instructions"}>
        <textarea aria-label="Instructions" value={step.detail} onChange={(event) => onStep(step.id, { detail: event.target.value })} rows={step.kind === "analyze" ? 5 : 3} placeholder={step.kind === "analyze" ? "Find the biggest changes versus last week and explain why." : "Optional notes for this step"} className="w-full resize-y rounded-md border bg-surface p-2.5 text-xs leading-5 outline-none placeholder:text-muted-foreground focus:border-border-strong" />
      </Field>
    </div>
  );
}

export function insertStep(steps: WorkflowStep[], index: number, kind: StepKind): { steps: WorkflowStep[]; added: WorkflowStep } {
  const added = newStep(kind);
  return { steps: [...steps.slice(0, index), added, ...steps.slice(index)], added };
}
