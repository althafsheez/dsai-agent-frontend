"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { WorkflowStepDto } from "@/lib/api";
import { DatasetPicker } from "@/features/dashboards/components/dataset-picker";
import type { DatasetLite } from "@/features/dashboards/types";
import { kindInfo } from "../logic/steps";

const field = "w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong";
const label = "mb-1 block text-[11px] font-medium text-muted-foreground";

export function StepActions({ first, last, onMove, onRemove, name }: { first: boolean; last: boolean; onMove: (by: -1 | 1) => void; onRemove: () => void; name: string }) {
  const button = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30";
  return (
    <>
      <button type="button" className={button} disabled={first} aria-label={`Move ${name} up`} onClick={() => onMove(-1)}><ArrowUp className="size-3.5" /></button>
      <button type="button" className={button} disabled={last} aria-label={`Move ${name} down`} onClick={() => onMove(1)}><ArrowDown className="size-3.5" /></button>
      <button type="button" className={`${button} hover:text-rose-400`} aria-label={`Remove ${name}`} onClick={onRemove}><Trash2 className="size-3.5" /></button>
    </>
  );
}

/** The fields of one step. Only what that kind needs is shown. */
export function StepEditor({ step, datasets, loading, onChange }: { step: WorkflowStepDto; datasets: DatasetLite[]; loading: boolean; onChange: (next: WorkflowStepDto) => void }) {
  const [showScript, setShowScript] = useState(false);
  const config = step.config ?? {};
  const setConfig = (patch: Record<string, unknown>) => onChange({ ...step, config: { ...config, ...patch } });
  const ids = Array.isArray(config.dataset_ids) ? (config.dataset_ids as string[]) : [];
  const script = typeof config.script === "string" ? config.script : "";
  return (
    <div className="mt-3 grid gap-3 border-t pt-3">
      <label className="block"><span className={label}>Name of this step</span><input value={step.title} onChange={(event) => onChange({ ...step, title: event.target.value })} className={field} /></label>
      {step.kind === "data" ? (
        <div><span className={label}>Which datasets?</span><DatasetPicker datasets={datasets} loading={loading} selected={ids} onToggle={(id) => setConfig({ dataset_ids: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] })} /></div>
      ) : null}
      {step.kind === "script" || step.kind === "ai" ? (
        <label className="block">
          <span className={label}>{step.kind === "script" ? "What should it calculate?" : "What should the AI answer?"}</span>
          <textarea value={step.detail} rows={3} onChange={(event) => onChange({ ...step, detail: event.target.value })} placeholder={step.kind === "script" ? "e.g. Revenue per region, ranked, and the share of the total." : "e.g. Write three sentences on how sales are going."} className={`${field} resize-y`} />
        </label>
      ) : null}
      {step.kind === "script" ? (
        <div className="rounded-md border border-dashed p-2.5 text-[11px] text-muted-foreground">
          {script ? (
            <>
              <p>Python script ready{config.script_for && config.script_for !== step.detail ? " — your description changed, it will be rewritten on save" : ""}. It runs by itself on every run.</p>
              <button type="button" onClick={() => setShowScript(!showScript)} className="mt-1 text-sky-300 hover:underline">{showScript ? "Hide the script" : "Show the script"}</button>
              {showScript ? <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-2 text-[11px] leading-relaxed text-foreground">{script}</pre> : null}
            </>
          ) : <p>No script yet. “Build with AI” (or Save) makes the AI write one and test it on your real data.</p>}
        </div>
      ) : null}
      {step.kind === "condition" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={label}>Continue when the number is</span>
            <select value={String(config.operator ?? "greater")} onChange={(event) => setConfig({ operator: event.target.value })} className={field}><option value="greater">greater than</option><option value="less">less than</option><option value="equals">equal to</option></select></label>
          <label className="block"><span className={label}>This number</span><input inputMode="decimal" value={String(config.value ?? "")} onChange={(event) => setConfig({ value: event.target.value })} className={field} /></label>
        </div>
      ) : null}
      {step.kind === "notify" ? (
        <label className="block"><span className={label}>Send to</span><input value={String(config.recipient ?? "me")} onChange={(event) => setConfig({ recipient: event.target.value })} className={field} /><span className="mt-1 block text-[11px] text-muted-foreground">Delivered inside the app and kept in the run history. {kindInfo("notify").needs}.</span></label>
      ) : null}
    </div>
  );
}
