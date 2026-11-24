"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModelMetadata, WorkflowStepDto } from "@/lib/api";
import { DatasetPicker } from "@/features/dashboards/components/dataset-picker";
import type { DatasetLite } from "@/features/dashboards/types";
import { ConnectorConfiguration } from "./connector-configuration";

const field = "w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

export function StepActions({ first, last, onMove, onRemove, name }: { first: boolean; last: boolean; onMove: (by: -1 | 1) => void; onRemove: () => void; name: string }) {
  const button = "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30";
  return (
    <>
      <button type="button" className={button} disabled={first} aria-label={`Move ${name} up`} onClick={() => onMove(-1)}><ArrowUp className="size-3.5" /></button>
      <button type="button" className={button} disabled={last} aria-label={`Move ${name} down`} onClick={() => onMove(1)}><ArrowDown className="size-3.5" /></button>
      <button type="button" className={`${button} hover:text-destructive`} aria-label={`Remove ${name}`} onClick={onRemove}><Trash2 className="size-3.5" /></button>
    </>
  );
}

export function StepEditor({ step, datasets, loading, models, onChange, onBuild, canBuild, buildDatasetCount }: {
  step: WorkflowStepDto;
  datasets: DatasetLite[];
  loading: boolean;
  models: ModelMetadata[];
  onChange: (next: WorkflowStepDto) => void;
  onBuild: () => void;
  canBuild: boolean;
  buildDatasetCount: number;
}) {
  const [showDatasets, setShowDatasets] = useState(false);
  const config = step.config ?? {};
  const setConfig = (patch: Record<string, unknown>) => onChange({ ...step, config: { ...config, ...patch } });
  const ids = Array.isArray(config.dataset_ids) ? config.dataset_ids as string[] : [];
  const script = typeof config.script === "string" ? config.script : "";
  const model = models.find((item) => item.id === config.model_id);
  const aiOrCustom = step.kind === "ai" || step.kind === "script";
  const detailLabel = step.kind === "script" ? "What should this step do?" : "Instructions";
  const datasetPicker = <div className="space-y-2">
    <DatasetPicker datasets={datasets} loading={loading} selected={ids} onToggle={(id) => {
      if (!ids.includes(id) && ids.length >= 8) return;
      setConfig({ dataset_ids: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] });
    }} />
    {ids.length >= 8 && <p className="mt-2 text-xs text-muted-foreground">Up to eight datasets per step.</p>}
  </div>;

  return (
    <div className="mt-3 grid gap-3 border-t pt-3">
      {(step.kind !== "script" || script) && <label><span className={label}>Step name</span>
        <input value={step.title} maxLength={160} onChange={(event) => onChange({ ...step, title: event.target.value })} className={field} />
      </label>}
      {step.kind === "data" && <ConnectorConfiguration config={config} onChange={setConfig} instructions={step.detail}
        onInstructionsChange={(detail) => onChange({ ...step, detail, config: { ...config, action: undefined } })} />}
      {aiOrCustom && <div className="overflow-hidden rounded-lg border bg-background">
        <textarea aria-label={detailLabel} placeholder={step.kind === "script" ? detailLabel : "Describe the task for the AI…"}
          value={step.detail} rows={4} maxLength={2000} onChange={(event) => onChange({ ...step, detail: event.target.value })}
          className="block w-full resize-y bg-transparent px-2.5 py-2 text-xs placeholder:text-muted-foreground" />
        <div className="flex items-center justify-between gap-1.5 border-t p-1.5">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Attach Library datasets" aria-expanded={showDatasets}
            onClick={() => setShowDatasets(!showDatasets)}><Plus /></Button>
          {ids.length > 0 && <span className="mr-auto text-[11px] text-muted-foreground">{ids.length} attached</span>}
          {step.kind === "script" && <Button size="sm" variant="outline" disabled={!canBuild || buildDatasetCount < 1 || buildDatasetCount > 8 || !step.detail.trim()}
            onClick={onBuild}><Sparkles /> {script ? "Rebuild step" : "Build step"}</Button>}
        </div>
      </div>}
      {step.kind === "script" && buildDatasetCount === 0 && <p className="text-xs text-muted-foreground">Attach a dataset to this step to build and test it.</p>}
      {step.kind === "script" && buildDatasetCount > 8 && <p className="text-xs text-muted-foreground">Select up to eight datasets to build this step.</p>}
      {showDatasets && <details open className="rounded-md border p-2">
        <summary className="mb-2 cursor-pointer text-xs font-medium">Library datasets</summary>
        {datasetPicker}
      </details>}
      {step.kind === "script" && script && <details className="rounded-md border p-2.5 text-xs">
        <summary className="cursor-pointer font-medium">Generated Python</summary>
        {config.script_for && config.script_for !== step.detail ? <p className="mt-2 text-muted-foreground">Instructions changed. Rebuild to use them.</p> : null}
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-2 text-[11px] leading-relaxed">{script}</pre>
      </details>}
      {step.kind === "ai" && <>
        <label><span className={label}>Model</span>
          <select className={field} value={String(config.model_id ?? "")} onChange={(event) => setConfig({ model_id: event.target.value, effort: "" })}>
            <option value="">Workflow default</option>
            {!model && typeof config.model_id === "string" && config.model_id && <option value={config.model_id}>{config.model_id} (unavailable)</option>}
            {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {!!model?.supported_efforts?.length && <label><span className={label}>Reasoning effort</span>
          <select className={field} value={String(config.effort ?? "")} onChange={(event) => setConfig({ effort: event.target.value })}>
            <option value="">Model default</option>
            {model.supported_efforts.map((effort) => <option key={effort}>{effort}</option>)}
          </select>
        </label>}
        <p className="text-xs text-muted-foreground">Uses available datasets and the previous step’s result. Charts and reports appear in the run outputs.</p>
      </>}
      {step.kind === "condition" && <>
        <p className="text-xs text-muted-foreground">Compare a number from the previous step. True continues the workflow and False ends the path.</p>
        <div className="grid grid-cols-2 gap-2">
          <label><span className={label}>Comparison</span>
            <select value={String(config.operator ?? "greater")} onChange={(event) => setConfig({ operator: event.target.value })} className={field}>
              <option value="greater">Greater than</option><option value="less">Less than</option><option value="equals">Equal to</option>
            </select>
          </label>
          <label><span className={label}>Value</span><input inputMode="decimal" value={String(config.value ?? "")}
            onChange={(event) => setConfig({ value: event.target.value })} className={field} /></label>
        </div>
      </>}
      {step.kind === "human" && <>
        <label><span className={label}>Review instructions</span>
          <textarea value={step.detail} rows={4} maxLength={2000} className={field}
            placeholder="What should the reviewer check?"
            onChange={(event) => onChange({ ...step, detail: event.target.value })} />
        </label>
        <p className="text-xs text-muted-foreground">Draft only. Sending review requests and resuming after a decision are coming later.</p>
      </>}
      {step.kind === "notify" && <>
        <label><span className={label}>Destination</span>
          <select className={field} value={config.destination === "library" ? "library" : "result"}
            onChange={(event) => setConfig({ destination: event.target.value })}>
            <option value="result">Final workflow result</option>
            <option value="library">Save files to Library</option>
          </select>
        </label>
        {config.destination === "library" ? (
          <p className="text-xs text-muted-foreground">Saves files from the previous step to your Library on a normal run. Test runs preview the files.</p>
        ) : <>
          <label><span className={label}>In-app recipient</span><input value={String(config.recipient ?? "me")}
            onChange={(event) => setConfig({ recipient: event.target.value })} className={field} /></label>
          <p className="text-xs text-muted-foreground">The previous step’s result is retained in the run history.</p>
        </>}
      </>}
    </div>
  );
}
