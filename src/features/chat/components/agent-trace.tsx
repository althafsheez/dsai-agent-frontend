"use client";

import type { AgentRunDto } from "@/lib/api";
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, ChevronUp, Circle, Code2, Copy, Database, FileText, LoaderCircle, RotateCcw, Sparkles, Terminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import type { TraceResourceReference, TraceStep } from "../types";

/**
 * Animated 3-dot pulsating ellipsis for active reasoning in progress
 */
export function ReasoningEllipsis() {
  return (
    <span
      role="status"
      aria-label="Reasoning in progress"
      className="flex gap-1 items-center ml-1.5 shrink-0"
    >
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className="reasoning-dot h-1.5 w-1.5 rounded-full bg-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Formats duration in milliseconds to human-readable string
 */
function formatDuration(ms?: number): string | null {
  if (ms === undefined || ms === null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Truncates and renders thought text with a 250-character toggle
 */
export function IndividualThoughtTextRenderer({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const threshold = 250;
  const isLong = text.length > threshold;

  const displayText = useMemo(() => {
    if (!isLong || isExpanded || isStreaming) return text;
    let truncated = text.slice(0, threshold);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > threshold * 0.8) {
      truncated = truncated.slice(0, lastSpace);
    }
    return truncated + "…";
  }, [text, isLong, isExpanded, isStreaming]);

  return (
    <div className="mt-0.5 flex items-start gap-1">
      <p className="text-foreground/80 leading-relaxed break-words text-[12.5px] min-w-0 flex-1 overflow-hidden">
        {displayText}
      </p>
      {isLong && !isStreaming && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-raised hover:text-foreground transition-colors cursor-pointer"
          title={isExpanded ? "Show less" : "Show more"}
          aria-label={isExpanded ? "Show less" : "Show more"}
        >
          {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      )}
    </div>
  );
}

/**
 * Clickable input/output chips for resources generated or consumed by trace steps
 */
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
            className="inline-flex max-w-full items-center gap-1.5 rounded border border-border-strong bg-raised px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-slate hover:bg-surface cursor-pointer"
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

/**
 * Individual step item inside the vertical reasoning timeline
 */
function TimelineStepItem({
  step,
  isLast,
  hasSubsequentSteps,
  isStreaming,
  onResourceSelect,
}: {
  step: TraceStep;
  isLast: boolean;
  hasSubsequentSteps: boolean;
  isStreaming?: boolean;
  onResourceSelect?: (id: string) => void;
}) {
  const isRunning = step.status === "running";
  const isFailed = step.status === "failed";
  const isCompleted = step.status === "completed";
  const isRecovered = isFailed && hasSubsequentSteps;

  const [open, setOpen] = useState(isRunning || isFailed);
  const [copiedCode, setCopiedCode] = useState(false);

  const duration = formatDuration(step.durationMs);
  const codeContent = step.code || step.sql;
  const codeLanguage = step.sql ? "sql" : "python";

  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!codeContent) return;
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      // ignore
    }
  };

  const results =
    step.results === undefined
      ? ""
      : typeof step.results === "string"
        ? step.results
        : JSON.stringify(step.results, null, 2);

  const Icon = isCompleted ? Check : isFailed ? (isRecovered ? RotateCcw : X) : isRunning ? LoaderCircle : Circle;

  return (
    <div
      id={`trace-step-${step.id}`}
      className={cn(
        "group relative rounded-md border border-transparent p-1.5 transition-all duration-200",
        isRunning && "bg-surface/50 border-border/40",
        isRecovered && "bg-amber-400/5 border-amber-400/20",
        isFailed && !isRecovered && "bg-red-400/5 border-red-400/20"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 text-left text-xs cursor-pointer select-none"
      >
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded">
          <Icon
            className={cn(
              "size-3.5",
              isCompleted && "text-sage",
              isRecovered && "text-amber-400",
              isFailed && !isRecovered && "text-red-400",
              isRunning && "animate-spin text-slate",
              step.status === "pending" && "text-muted-foreground"
            )}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground text-[12.5px]">{step.label}</span>
            {isRecovered && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-300 border border-amber-400/20">
                <RotateCcw className="size-2.5" />
                Recovered
              </span>
            )}
            {duration && (
              <span className="text-[10px] font-mono text-muted-foreground">{duration}</span>
            )}
            {isRunning && (
              <span className="text-[10px] text-slate animate-pulse font-medium">Running…</span>
            )}
          </div>

          {step.summary && (
            <IndividualThoughtTextRenderer
              text={step.summary}
              isStreaming={isStreaming && isLast}
            />
          )}
        </div>

        {(codeContent || step.stdout || step.stderr || step.error || step.inputs?.length || step.outputs?.length) ? (
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground/60 transition-transform duration-200 mt-1 shrink-0",
              open ? "rotate-180" : "rotate-0"
            )}
          />
        ) : null}
      </button>

      {/* Expandable details: code, stdout, stderr, resources, errors */}
      {open && (
        <div className="mt-2.5 ml-6 space-y-2 border-t border-border/40 pt-2 text-xs">
          {isRecovered && (
            <div className="flex items-start gap-1.5 rounded bg-amber-400/10 border border-amber-400/20 p-2 text-amber-200 text-[11px]">
              <RotateCcw className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold">Self-corrected: </span>
                An error occurred during this step and the agent automatically adapted and succeeded in subsequent execution.
              </div>
            </div>
          )}

          {step.error && (
            <div className="rounded bg-red-400/10 border border-red-400/20 p-2 text-red-200 text-[11px] font-mono whitespace-pre-wrap">
              <span className="font-semibold block mb-0.5 text-red-300">Execution Error:</span>
              {step.error}
            </div>
          )}

          {codeContent && (
            <div className="rounded-md border border-border bg-background overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5 font-mono uppercase text-[10px] text-primary">
                  <Code2 className="size-3" />
                  <span>{codeLanguage}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label="Copy code"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-raised text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Copy className="size-2.5" />
                  <span>{copiedCode ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="overflow-x-auto p-2.5 text-[11px] font-mono leading-5 text-[#d4d4d4]">
                <code>{codeContent}</code>
              </pre>
            </div>
          )}

          {step.stdout && (
            <div className="rounded border border-border bg-background/50 p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase font-mono text-muted-foreground mb-1">
                <Terminal className="size-3 text-slate" />
                <span>stdout</span>
              </div>
              <pre className="text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                {step.stdout}
              </pre>
            </div>
          )}

          {step.stderr && (
            <div className="rounded border border-amber-400/20 bg-amber-400/5 p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase font-mono text-amber-300 mb-1">
                <AlertCircle className="size-3 text-amber-400" />
                <span>stderr</span>
              </div>
              <pre className="text-[11px] font-mono text-amber-200/90 overflow-x-auto whitespace-pre-wrap">
                {step.stderr}
              </pre>
            </div>
          )}

          {results && !codeContent && (
            <div className="rounded border border-border bg-background/40 p-2 text-[11px] font-mono text-foreground/80 overflow-x-auto">
              {results}
            </div>
          )}

          <ResourceChips
            label="Input resources"
            resources={step.inputs}
            onResourceSelect={onResourceSelect}
          />

          <ResourceChips
            label="Output resources"
            resources={step.outputs}
            onResourceSelect={onResourceSelect}
          />
        </div>
      )}
    </div>
  );
}

export function AgentTrace({
  steps,
  run,
  isStreaming = false,
  isOpen: controlledIsOpen,
  onOpenChange,
  className,
  onResourceSelect,
}: {
  steps: TraceStep[];
  run?: AgentRunDto;
  isStreaming?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  onResourceSelect?: (id: string) => void;
}) {
  const [localIsOpen, setLocalIsOpen] = useState(isStreaming || Boolean(run));
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : localIsOpen;

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setLocalIsOpen(open);
      }
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange]
  );

  // Auto-expand during live streaming, collapse on complete
  useEffect(() => {
    if (isStreaming) {
      handleOpenChange(true);
    }
  }, [isStreaming, handleOpenChange]);

  // Deep-linking: listen for citation events to expand trace and scroll to target
  useEffect(() => {
    const handleScrollRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{ resourceId?: string; tableName?: string }>;
      handleOpenChange(true);
      const targetId = customEvent.detail?.resourceId || customEvent.detail?.tableName;
      if (targetId) {
        setTimeout(() => {
          const element =
            document.getElementById(`trace-step-${targetId}`) ||
            document.querySelector(`[aria-label*="${targetId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-2", "ring-sage", "bg-sage/10");
            setTimeout(() => {
              element.classList.remove("ring-2", "ring-sage", "bg-sage/10");
            }, 2000);
          }
        }, 150);
      }
    };

    window.addEventListener("expand-and-scroll-to-table", handleScrollRequest);
    window.addEventListener("expand-and-scroll-to-resource", handleScrollRequest);
    return () => {
      window.removeEventListener("expand-and-scroll-to-table", handleScrollRequest);
      window.removeEventListener("expand-and-scroll-to-resource", handleScrollRequest);
    };
  }, [handleOpenChange]);

  if (!steps?.length) return null;

  const latestStep = steps[steps.length - 1];
  const activeStep = steps.find((s) => s.status === "running") || latestStep;

  const isCompleted = !isStreaming && steps.every((s) => s.status === "completed");
  const hasFailed = !isStreaming && steps.some((s) => s.status === "failed");
  const elapsed = run?.started_at && run.finished_at ? Date.parse(run.finished_at) - Date.parse(run.started_at) : null;
  const totalTime = elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 ? formatDuration(elapsed) : null;

  // Summary for header
  const stepLabel = activeStep.label;
  const stepSummary = activeStep.summary || (isCompleted ? `${steps.length} step${steps.length > 1 ? "s" : ""} completed` : "Processing…");

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn("w-full max-w-full my-2 transition-all duration-200", className)}
    >
      {/* Collapsible Header */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label="Toggle Reasoning Trace"
          className="flex items-center justify-between w-full text-left py-1.5 px-2.5 rounded-md hover:bg-surface/60 transition-colors group cursor-pointer border border-border/50 bg-surface/30"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[12.5px] font-semibold text-foreground/90 group-hover:text-foreground shrink-0 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-sage shrink-0" />
              Reasoning Trace
            </span>
            <span className="text-foreground/40 shrink-0">·</span>
            <span className="text-[12.5px] text-foreground/70 truncate min-w-0 font-normal">
              <strong className="font-medium text-foreground/90 mr-1">{stepLabel}</strong>
              <span className="text-foreground/60">{stepSummary}</span>
            </span>
            {isStreaming && (
              <>
                <span className="text-[11px] text-slate font-medium shrink-0 animate-pulse ml-1">Running…</span>
                <ReasoningEllipsis />
              </>
            )}
            {isCompleted && (
              <span className="text-[11px] text-sage font-medium shrink-0 flex items-center gap-1 ml-auto mr-1">
                <Check className="size-3" />
                Completed
              </span>
            )}
            {totalTime && <span className="shrink-0 text-[10px] text-muted-foreground">Total time · {totalTime}</span>}
            {hasFailed && (
              <span className="text-[11px] text-red-400 font-medium shrink-0 flex items-center gap-1 ml-auto mr-1">
                <X className="size-3" />
                Failed
              </span>
            )}
          </div>
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground/60 transition-transform duration-200 shrink-0 ml-2 group-hover:text-foreground",
              isOpen ? "rotate-90" : "rotate-0"
            )}
          />
        </button>
      </CollapsibleTrigger>

      {/* Indented Vertical Timeline */}
      <CollapsibleContent className="animate-in slide-in-from-top-1 fade-in duration-200">
        <div className="mt-2 ml-1 pl-3.5 border-l-2 border-border/50 space-y-2 py-1 text-[13px]">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const hasSubsequentSteps = steps.slice(index + 1).length > 0;

            return (
              <TimelineStepItem
                key={step.id}
                step={step}
                isLast={isLast}
                hasSubsequentSteps={hasSubsequentSteps}
                isStreaming={isStreaming}
                onResourceSelect={onResourceSelect}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const AgentThoughtGroupRenderer = AgentTrace;
