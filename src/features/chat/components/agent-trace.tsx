"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, Database, FileText, LoaderCircle, Terminal, X } from "lucide-react";
import type { TraceResourceReference, TraceStep } from "../types";
import { cn } from "@/lib/utils";

function ResourceChips({
  label,
  resources,
  onResourceSelect,
}: {
  label: string;
  resources?: TraceResourceReference[];
  onResourceSelect?: (id: string) => void;
}) {
  if (!resources?.length) return null;
  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {resources.map((resource) => (
          <button
            key={resource.id}
            type="button"
            aria-label={`Select ${resource.name}`}
            onClick={() => onResourceSelect?.(resource.id)}
            className="inline-flex max-w-full items-center gap-1.5 rounded border border-border-strong bg-raised px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-slate hover:bg-surface"
          >
            {resource.resourceType === "dataset" ? (
              <Database className="size-3 shrink-0 text-sage" />
            ) : (
              <FileText className="size-3 shrink-0 text-sky-400" />
            )}
            <span className="truncate">{resource.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDuration(ms?: number): string | null {
  if (ms === undefined || ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepCard({
  step,
  isLast,
  hasSubsequentSteps,
  onResourceSelect,
}: {
  step: TraceStep;
  isLast: boolean;
  hasSubsequentSteps: boolean;
  onResourceSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(step.status === "running" || step.status === "failed");
  const isRunning = step.status === "running";
  const isFailed = step.status === "failed";
  const isCompleted = step.status === "completed";

  const Icon = isCompleted ? Check : isFailed ? X : isRunning ? LoaderCircle : Circle;
  const results =
    step.results === undefined
      ? ""
      : typeof step.results === "string"
        ? step.results
        : JSON.stringify(step.results, null, 2);

  const duration = formatDuration(step.durationMs);

  // If a failed step is followed by subsequent steps in the same run, it was recovered
  const isRecovered = isFailed && hasSubsequentSteps;

  return (
    <li className="rounded-md border border-transparent px-1 py-1 transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 rounded px-1.5 py-1 text-left text-xs"
      >
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            isCompleted && "text-sage",
            isFailed && "text-red-400",
            isRunning && "animate-spin text-slate",
            step.status === "pending" && "text-muted-foreground"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{step.label}</span>
            {isRecovered && (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.2 text-[9px] font-medium text-amber-300">
                Recovered
              </span>
            )}
            {duration && (
              <span className="text-[10px] text-muted-foreground">{duration}</span>
            )}
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {step.summary ?? step.detail ?? (isRunning ? "Tool is running…" : "Execution step")}
          </span>
        </div>
        <ChevronDown
          className={cn("mt-0.5 size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="ml-7 mt-1.5 border-l border-border/70 pb-2 pl-3.5 text-[11px] text-muted-foreground">
          <ResourceChips label="Inputs" resources={step.inputs} onResourceSelect={onResourceSelect} />
          <ResourceChips label="Outputs" resources={step.outputs} onResourceSelect={onResourceSelect} />

          {step.code && (
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Terminal className="size-3" />
                <span>Python Script</span>
              </div>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-background/80 p-2.5 font-mono text-[10px] leading-relaxed text-foreground/90">
                {step.code}
              </pre>
            </div>
          )}

          {step.sql && (
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Database className="size-3" />
                <span>SQL Query</span>
              </div>
              <pre className="mt-1 max-h-36 overflow-auto rounded-md border bg-background/80 p-2.5 font-mono text-[10px] leading-relaxed text-foreground/90">
                {step.sql}
              </pre>
            </div>
          )}

          {results && (
            <div className="mt-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Bounded result
              </p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-background/80 p-2.5 font-mono text-[10px] leading-relaxed text-foreground/90">
                {results.slice(0, 8000)}
              </pre>
            </div>
          )}

          {step.stdout && (
            <div className="mt-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Standard output
              </p>
              <pre className="mt-1 max-h-36 overflow-auto rounded-md border bg-background/80 p-2.5 font-mono text-[10px] leading-relaxed text-foreground/80">
                {step.stdout}
              </pre>
            </div>
          )}

          {step.stderr && (
            <div className="mt-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-300">
                Standard error
              </p>
              <pre className="mt-1 max-h-36 overflow-auto rounded-md border border-amber-400/20 bg-amber-950/10 p-2.5 font-mono text-[10px] leading-relaxed text-amber-200">
                {step.stderr}
              </pre>
            </div>
          )}

          {step.error && (
            <div className="mt-2.5 rounded-md border border-red-500/25 bg-red-950/15 p-2.5 text-red-200">
              <p className="font-medium text-[11px] text-red-300">Execution Error</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-red-200/90">{step.error}</p>
              {isRecovered ? (
                <p className="mt-1.5 text-[10px] text-amber-300">
                  Self-correction succeeded: Error was automatically recovered in subsequent steps.
                </p>
              ) : isLast ? (
                <p className="mt-1.5 text-[10px] text-red-300/80">
                  Unrecoverable failure: Execution halted at this step. Completed progress is preserved.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function AgentTrace({
  steps,
  onResourceSelect,
}: {
  steps: TraceStep[];
  onResourceSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const running = steps.some((step) => step.status === "running" || step.status === "pending");
  const failed = !running && steps.some((step) => step.status === "failed");
  const completed = !running && !failed && steps.every((step) => step.status === "completed");

  const runningStep = steps.find((step) => step.status === "running");

  return (
    <div className="my-4 rounded-lg border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium hover:bg-raised/50"
      >
        <ChevronDown
          className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
        <span>Agent execution</span>
        {running ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin text-slate" />
            {runningStep ? `Running ${runningStep.label}…` : "Running…"}
          </span>
        ) : failed ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-normal text-red-400">
            <X className="size-3" />
            Failed ({steps.filter((s) => s.status === "completed").length} completed)
          </span>
        ) : completed ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-normal text-sage">
            <Check className="size-3" />
            Completed ({steps.length} {steps.length === 1 ? "step" : "steps"})
          </span>
        ) : null}
      </button>

      {open && (
        <ol className="space-y-1 border-t px-3 py-2" aria-label="Execution progress">
          {steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              isLast={index === steps.length - 1}
              hasSubsequentSteps={index < steps.length - 1 && steps.slice(index + 1).some((s) => s.status === "completed")}
              onResourceSelect={onResourceSelect}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
