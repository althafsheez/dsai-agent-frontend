"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Database, FileText, Pencil } from "lucide-react";
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
 * this app's TraceStep model: header, indented timeline, markdown thoughts with inline
 * code chips, 250-character truncation, collapsed code blocks with Copy/Edit/Run, data
 * table pills and the three-dot ellipsis. Run stays disabled because this backend has
 * no ad-hoc code execution endpoint.
 */

// The app's colors are oklch variables, so Tailwind's `/80` opacity shorthand does not apply.
const fg80 = "text-[color-mix(in_oklch,var(--foreground)_80%,transparent)]";
const fg60 = "text-[color-mix(in_oklch,var(--foreground)_60%,transparent)]";
const fg40 = "text-[color-mix(in_oklch,var(--foreground)_40%,transparent)]";
const mutedFg60 = "text-[color-mix(in_oklch,var(--muted-foreground)_60%,transparent)]";
const border50 = "border-[color-mix(in_oklch,var(--border)_50%,transparent)]";
const border60 = "border-[color-mix(in_oklch,var(--border)_60%,transparent)]";
const border40 = "border-[color-mix(in_oklch,var(--border)_40%,transparent)]";

/** Inline markdown used by reasoning thoughts: `code`, **bold** and *italic*. */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={index} className={cn("rounded-md border bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-foreground", border50)}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__")))) {
          return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

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
      <div className={cn("min-w-0 max-w-none flex-1 overflow-hidden break-words text-[13px] leading-relaxed", fg80)}>
        {displayText.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index} className="my-1 whitespace-pre-wrap leading-[1.9]">
            <InlineMarkdown text={paragraph} />
          </p>
        ))}
      </div>
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
  const description = step.label;
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableCode, setEditableCode] = useState(code);

  useEffect(() => {
    setEditableCode(code);
  }, [code]);
  const hasOutput = Boolean(step.stdout || step.stderr || step.error || step.queryTable);
  const outputStatus = step.status === "failed" ? "(failed)" : step.status === "running" ? "(running...)" : "(success)";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; copying is best effort.
    }
  };

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-md">
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
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!isOpen) setIsOpen(true);
              setIsEditing(!isEditing);
            }}
            title={isEditing ? "Done" : "Edit"}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/10",
              isEditing ? "font-semibold text-blue-400" : "text-white/50 hover:text-white"
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>{isEditing ? "Done" : "Edit"}</span>
          </button>
          <button
            type="button"
            disabled
            onClick={(event) => event.stopPropagation()}
            title="Running code from the trace is not available yet"
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-white/50 transition-colors disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            <span>Run</span>
          </button>
          <div className="mx-1 h-3 w-px bg-white/10" />
          <ChevronRight className={cn("h-4 w-4 text-white/40 transition-transform", isOpen ? "rotate-90" : "rotate-0")} />
        </div>
      </div>

      {isOpen && (
        <div className="flex flex-col">
          {isEditing ? (
            <div className="bg-black/40 p-4">
              <textarea
                aria-label={`Edit ${description} code`}
                value={editableCode}
                onChange={(event) => setEditableCode(event.target.value)}
                className="h-48 w-full resize-y rounded-md border border-white/10 bg-transparent p-3 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter Python code..."
                spellCheck={false}
              />
            </div>
          ) : (
            <pre className="max-h-[500px] overflow-auto p-4 text-[13px] leading-relaxed">
              <SyntaxHighlightedCode code={editableCode} language={language} />
            </pre>
          )}
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

/** Data table / file pill, matching the reference ThoughtTableRenderer. */
function TracePill({ name, resourceType, onSelect }: { name: string; resourceType: "dataset" | "artifact"; onSelect?: () => void }) {
  const Icon = resourceType === "dataset" ? Database : FileText;
  return (
    <button
      type="button"
      aria-label={`Select ${name}`}
      title={name}
      onClick={onSelect}
      className={cn(
        "mx-1 inline-flex max-w-[180px] cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-full border bg-surface-2 px-2 py-0.5 align-middle font-sans text-xs font-medium leading-none text-foreground transition-all duration-200 hover:border-border hover:bg-surface-3",
        border60
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </button>
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
  const processingStatus = isStreaming ? ((latest.code || latest.sql) && latest.status === "running" ? "Executing code..." : stripMarkdown(thoughtText(latest))) : null;
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
        <div className={cn("mt-2 space-y-2 border-l-2 py-1 pl-3 text-[13px]", border40)}>
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const hasCode = Boolean(step.code || step.sql);
            return (
              <div key={step.id} id={`trace-step-${step.id}`} className="min-w-0 rounded-sm transition-shadow">
                {(!hasCode || step.summary) && (
                  <IndividualThoughtTextRenderer text={thoughtText(step)} isStreaming={isStreaming && isLast} />
                )}
                {hasCode && (
                  <div className={cn("w-full min-w-0 overflow-hidden", (step.summary || !steps[index - 1]?.code && !steps[index - 1]?.sql) && index > 0 && "mt-4")}>
                    <TraceCodeBlock step={step} />
                  </div>
                )}
                {step.error && (!hasCode || step.diagnostic) && (
                  <TraceError message={step.error} diagnostic={step.diagnostic} />
                )}
                {!hasCode && step.queryTable && <TableBlock {...step.queryTable} />}
                {!hasCode && !step.queryTable && step.results !== undefined && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-border p-2 text-[11px]">
                    {typeof step.results === "string" ? step.results : JSON.stringify(step.results, null, 2)}
                  </pre>
                )}
                {step.outputs?.map((resource) => (
                  <div key={resource.id} className="mt-2 flex items-center gap-2.5">
                    <TracePill name={resource.name} resourceType={resource.resourceType} onSelect={() => onResourceSelect?.(resource.id)} />
                  </div>
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
