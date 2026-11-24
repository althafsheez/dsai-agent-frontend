"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, ChevronUp, Copy } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import type { AgentRunDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SyntaxHighlightedCode } from "./syntax-highlighted-code";
import type { TraceStep } from "../types";
import { ErrorDetails } from "./error-details";
import { TableBlock } from "./table-block";

/*
 * Reasoning Trace — ported from the DSAI reference frontend (agentic-ds-frontend,
 * `AgentThoughtGroupRenderer` in components/chat/event-renderer.tsx) and adapted to
 * this app's TraceStep model. Header, indented timeline, thought truncation, collapsed
 * code blocks and the three-dot ellipsis follow the reference. Code Edit/Run are not
 * ported because this backend has no ad-hoc execution endpoint.
 */

// The app's colors are oklch variables, so Tailwind's `/80` opacity shorthand does not apply.
const fg80 = "text-[color-mix(in_oklch,var(--foreground)_80%,transparent)]";
const fg60 = "text-[color-mix(in_oklch,var(--foreground)_60%,transparent)]";
const fg40 = "text-[color-mix(in_oklch,var(--foreground)_40%,transparent)]";
const mutedFg60 = "text-[color-mix(in_oklch,var(--muted-foreground)_60%,transparent)]";

/** Three animated dots at the end of the reasoning heading while reasoning is active. */
export function ReasoningEllipsis() {
  return (
    <span role="status" aria-label="Reasoning in progress" data-reasoning-ellipsis="" className="ml-1.5 flex shrink-0 items-center gap-1">
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

/** Renders an individual thought's text with a 250-character truncation toggle. */
export function IndividualThoughtTextRenderer({ text, isStreaming = false }: { text: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const threshold = 250;
  const isLong = text.length > threshold;

  const displayText = useMemo(() => {
    if (!isLong || isExpanded || isStreaming) return text;
    let truncated = text.slice(0, threshold);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > threshold * 0.8) truncated = truncated.slice(0, lastSpace);
    return `${truncated}...`;
  }, [text, isLong, isExpanded, isStreaming]);

  return (
    <div className="mt-1.5 flex items-start gap-1">
      <p className={cn("min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-[13px] leading-relaxed", fg80)}>{displayText}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-0.5 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={isExpanded ? "Show less" : "Show more"}
          aria-label={isExpanded ? "Show less" : "Show more"}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

/** Collapsed-by-default code block with language, stage description and copy action. */
function TraceCodeBlock({ step }: { step: TraceStep }) {
  const code = step.code ?? step.sql ?? "";
  const language = step.sql && !step.code ? "sql" : "python";
  const description = step.summary || step.label;
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const hasOutput = Boolean(step.stdout || step.stderr || step.error || step.queryTable);
  const outputStatus = step.status === "failed" ? "(failed)" : step.status === "running" ? "(running...)" : "(success)";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; copying is best effort.
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-[#0a0a0a] shadow-md">
      <div
        className={cn("flex w-full cursor-pointer items-center justify-between px-4 py-2 transition-colors hover:bg-white/5", isOpen && "border-b border-white/5")}
        onClick={() => setIsOpen(!isOpen)}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${description} ${language} block`}
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex min-w-0 items-baseline gap-2 rounded-sm text-left text-xs font-medium tracking-wide text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="shrink-0 uppercase">{language}</span>
          <span data-code-stage="" title={description} className={cn("normal-case text-white/70", isOpen ? "whitespace-normal break-words" : "truncate")}>
            {description}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleCopy();
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{isCopied ? "Copied" : "Copy"}</span>
          </button>
          <div className="mx-1 h-3 w-px bg-white/10" />
          <ChevronRight className={cn("h-4 w-4 text-white/40 transition-transform", isOpen ? "rotate-90" : "rotate-0")} />
        </div>
      </div>

      {isOpen && (
        <div className="flex flex-col">
          <pre className="max-h-[500px] overflow-auto p-4 text-[13px] leading-relaxed">
            <SyntaxHighlightedCode code={code} language={language} />
          </pre>
          {hasOutput && (
            <div className="space-y-2 border-t border-white/5 bg-black/20 p-4 font-mono text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output {outputStatus}</span>
              {step.stdout && (
                <div className="whitespace-pre-wrap rounded border border-emerald-800/30 bg-emerald-950/20 p-2.5 text-emerald-400">{step.stdout}</div>
              )}
              {(step.stderr || (step.error && !step.diagnostic)) && (
                <div className="whitespace-pre-wrap rounded border border-rose-800/30 bg-rose-950/20 p-2.5 text-rose-400">{step.stderr || step.error}</div>
              )}
              {step.queryTable && <TableBlock {...step.queryTable} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline error, matching the reference error card. */
function TraceError({ message, diagnostic }: { message: string; diagnostic?: TraceStep["diagnostic"] }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-[color-mix(in_oklch,var(--destructive)_50%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_5%,transparent)] p-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="text-sm font-medium text-destructive">Error</span>
      </div>
      <p className="mt-2 w-full min-w-0 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message}</p>
      {diagnostic?.tool && <ErrorDetails error={diagnostic} />}
    </div>
  );
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const stripMarkdown = (value: string) => value.replace(/(\*\*|__|\*|_|`)/g, "");
const thoughtText = (step: TraceStep) => step.summary || step.label;

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
  const [localIsOpen, setLocalIsOpen] = useState(isStreaming);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : localIsOpen;

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!isControlled) setLocalIsOpen(open);
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange]
  );

  // Open while the agent is reasoning so progress is visible.
  useEffect(() => {
    if (isStreaming) handleOpenChange(true);
  }, [isStreaming, handleOpenChange]);

  // Data references in the answer can ask the trace to open and scroll to the step that produced them.
  useEffect(() => {
    const handleScrollRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ resourceId?: string; tableName?: string }>).detail;
      const target = (detail?.resourceId || detail?.tableName || "").toLowerCase();
      if (!target) return;
      const step = steps.find((item) =>
        [...(item.inputs ?? []), ...(item.outputs ?? [])].some((resource) => resource.id.toLowerCase() === target || resource.name.toLowerCase() === target)
      );
      if (!step) return;
      handleOpenChange(true);
      setTimeout(() => {
        const element = document.getElementById(`trace-step-${step.id}`);
        if (!element) return;
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("ring-4", "ring-ring");
        setTimeout(() => element.classList.remove("ring-4", "ring-ring"), 2000);
      }, 150);
    };
    window.addEventListener("expand-and-scroll-to-table", handleScrollRequest);
    window.addEventListener("expand-and-scroll-to-resource", handleScrollRequest);
    return () => {
      window.removeEventListener("expand-and-scroll-to-table", handleScrollRequest);
      window.removeEventListener("expand-and-scroll-to-resource", handleScrollRequest);
    };
  }, [steps, handleOpenChange]);

  if (!steps?.length) return null;

  const latest = steps[steps.length - 1];
  const processingStatus = isStreaming ? ((latest.code || latest.sql) && latest.status === "running" ? "Executing code..." : thoughtText(latest)) : null;
  const finalLabel = processingStatus || stripMarkdown(thoughtText(latest)) || "Processing...";
  const elapsed = !isStreaming && run?.started_at && run.finished_at ? Date.parse(run.finished_at) - Date.parse(run.started_at) : null;
  const totalTime = elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 ? formatDuration(elapsed) : null;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className={cn("my-1 w-full max-w-full", className)}>
      <CollapsibleTrigger asChild>
        <button type="button" aria-label="Toggle Reasoning Trace" className="group flex w-full items-center justify-between text-left">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn("shrink-0 text-[13px] font-medium group-hover:text-foreground", fg80)}>Reasoning Trace</span>
            <span className={cn("shrink-0", fg40)}>·</span>
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", fg60)}>{finalLabel}</span>
            {isStreaming && <ReasoningEllipsis />}
            {totalTime && <span className="shrink-0 text-[11px] text-muted-foreground">Total time · {totalTime}</span>}
          </div>
          <ChevronRight className={cn("ml-2 h-4 w-4 shrink-0 transition-transform group-hover:text-muted-foreground", mutedFg60, isOpen ? "rotate-90" : "rotate-0")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 border-l-2 border-border py-1 pl-3 text-[13px]">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const hasCode = Boolean(step.code || step.sql);
            return (
              <div key={step.id} id={`trace-step-${step.id}`} className="min-w-0 rounded-sm transition-shadow">
                {hasCode ? (
                  <div className="my-2 w-full min-w-0 overflow-hidden">
                    <TraceCodeBlock step={step} />
                  </div>
                ) : (
                  <IndividualThoughtTextRenderer text={thoughtText(step)} isStreaming={isStreaming && isLast} />
                )}
                {step.status === "running" && <span className="text-[11px] text-muted-foreground">Running…</span>}
                {step.error && (!hasCode || step.diagnostic) && (
                  <TraceError message={step.error} diagnostic={step.diagnostic} />
                )}
                {!hasCode && step.queryTable && <TableBlock {...step.queryTable} />}
                {!hasCode && !step.queryTable && step.results !== undefined && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-border p-2 text-[11px]">
                    {typeof step.results === "string" ? step.results : JSON.stringify(step.results, null, 2)}
                  </pre>
                )}
                {step.inputs?.map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    aria-label={`Select ${resource.name}`}
                    onClick={() => onResourceSelect?.(resource.id)}
                    className={cn("mt-1.5 block max-w-full truncate text-left text-[13px] hover:text-foreground hover:underline", fg80)}
                  >
                    Input: {resource.name}
                  </button>
                ))}
                {step.outputs?.map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    aria-label={`Select ${resource.name}`}
                    onClick={() => onResourceSelect?.(resource.id)}
                    className={cn("mt-1.5 block max-w-full truncate text-left text-[13px] hover:text-foreground hover:underline", fg80)}
                  >
                    Generated: {resource.name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const AgentThoughtGroupRenderer = AgentTrace;
