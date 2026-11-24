import type { ExecutionEvent } from "@/lib/api";
import type { TraceResourceReference, TraceStep } from "./types";
import { diagnosticHeadline, interruptedDiagnostic, readDiagnostic, type ExecutionDiagnostic } from "./execution-diagnostic";

export type TraceReplay = {
  stepsByMessage: Map<string, TraceStep[]>;
  outputsByMessage: Map<string, TraceResourceReference[]>;
  errorsByMessage: Map<string, ExecutionDiagnostic>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function postgresQueryTable(name: unknown, output: Record<string, unknown>): TraceStep["queryTable"] {
  if (name !== "query_database" || !Array.isArray(output.columns) || !Array.isArray(output.rows)) return;
  const columns = output.columns.filter((column): column is string => typeof column === "string");
  if (columns.length !== output.columns.length || columns.length === 0) return;
  const rows = output.rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length !== columns.length) return [];
    return [row.map((cell) => (
      typeof cell === "string" || typeof cell === "number" ? cell
        : cell === null ? "NULL" : JSON.stringify(cell) ?? ""
    ))];
  });
  return {
    columns,
    rows,
    caption: output.truncated || rows.length !== output.rows.length
      ? "PostgreSQL query results (limited)" : "PostgreSQL query results",
  };
}

function resources(value: unknown): TraceResourceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const resource = asRecord(item);
    const id = resource?.id;
    const name = resource?.name;
    const resourceType = resource?.resource_type;
    if (typeof id !== "string" || typeof name !== "string" || (resourceType !== "dataset" && resourceType !== "artifact")) return [];
    return [{ id, name, resourceType, sizeBytes: typeof resource?.size_bytes === "number" ? resource.size_bytes : undefined }];
  });
}

function label(name: string) {
  return name.split("_").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

export function terminalDiagnostic(event: ExecutionEvent): ExecutionDiagnostic | undefined {
  const diagnostic = readDiagnostic(event.data.error);
  if (diagnostic) return diagnostic;
  if (event.type === "agent.cancelled" || event.type === "agent.interrupted") {
    return { ...interruptedDiagnostic(event.type === "agent.cancelled"), correlation_id: event.run_id };
  }
  if (event.type !== "agent.failed") return;
  // Older events may contain unstructured provider text. Recognize known
  // public messages and discard other legacy exception text.
  const error = asRecord(event.data.error);
  const status = error?.message === "Gemini is temporarily unavailable. Retry this analysis." ? 503
    : error?.code === "quota_exceeded" || error?.message === "Gemini's request quota was exceeded. Retry after the quota resets." ? 429
      : undefined;
  return {
    component: error?.code === "provider_error" || status ? "Gemini API" : "Agent",
    category: status === 503 ? "unavailable" : status === 429 ? "rate_limit" : "execution",
    message: status === 503 ? "Service unavailable" : status === 429 ? "Rate limit exceeded" : "Execution failed",
    code: status ? `gemini_http_${status}` : "execution_failed",
    stage: status ? "model_generation" : "run_execution",
    http_status: status,
    retryable: Boolean(status),
    correlation_id: event.run_id,
  };
}

export function finishTrace(
  steps: TraceStep[], runId: string, messageId: string, timestamp: string, error?: ExecutionDiagnostic,
): TraceStep[] {
  let attached = false;
  let hadRunningStep = false;
  const next = steps.map((step): TraceStep => {
    if (step.runId !== runId) return step;
    if (step.id === error?.step_id) attached = true;
    if (step.status === "running") hadRunningStep = true;
    if (step.id !== error?.step_id && step.status !== "running") return step;
    const failure = step.id === error?.step_id || error?.category === "cancelled" || error?.category === "interrupted"
      ? error : undefined;
    const message = failure?.message ?? "Tool stopped before reporting a result";
    return {
      ...step, status: "failed", detail: message, error: message, diagnostic: failure,
      completedAt: timestamp, durationMs: failure?.step_id ? failure.duration_ms : step.durationMs,
    };
  });
  if (error && !attached && (!(error.category === "cancelled" || error.category === "interrupted") || !hadRunningStep)) {
    next.push({
      id: error.step_id ?? `${runId}:terminal`,
      runId, messageId, label: error.tool ? label(error.tool) : error.component, status: "failed",
      summary: [error.stage.replaceAll("_", " "), error.turn === undefined ? null : `turn ${error.turn}`]
        .filter(Boolean).join(" · "),
      detail: error.message, error: diagnosticHeadline(error), diagnostic: error,
      completedAt: timestamp, durationMs: error.duration_ms,
    });
  }
  return next;
}

export function toolStepId(event: ExecutionEvent) {
  return typeof event.data.step_id === "string" ? event.data.step_id
    : `${event.run_id}:${String(event.data.tool_call_id ?? event.event_id)}`;
}

export function toolTraceStep(event: ExecutionEvent, messageId: string, prior?: TraceStep): TraceStep {
  const data = event.data;
  const step = {
    id: toolStepId(event), runId: event.run_id, messageId,
    label: label(typeof data.name === "string" ? data.name : "Tool"),
  };
  const summary = typeof data.summary === "string" ? data.summary : prior?.summary;
  if (event.type === "tool.started") {
    const args = asRecord(data.arguments) ?? {};
    return {
      ...step, summary, detail: "Running", status: "running", startedAt: event.timestamp,
      code: typeof data.code === "string" ? data.code : typeof args.code === "string" ? args.code : undefined,
      sql: typeof data.sql === "string" ? data.sql : typeof args.sql === "string" ? args.sql : undefined,
      inputs: resources(data.input_resources ?? args.input_resources),
    };
  }

  const output = asRecord(data.output) ?? {};
  const failed = event.type === "tool.failed";
  const diagnostic = failed ? readDiagnostic(data.diagnostic) : undefined;
  const error = failed ? diagnostic?.message ?? "Tool execution failed" : undefined;
  const outputs = resources(data.resources ?? output.resources);
  return {
    ...prior, ...step, summary, status: failed ? "failed" : "completed", detail: error ?? "Completed",
    completedAt: event.timestamp,
    durationMs: typeof data.duration_ms === "number" ? data.duration_ms : prior?.durationMs,
    outputs: outputs.length ? outputs : prior?.outputs,
    results: failed ? undefined : output.rows ?? output.results ?? output.text,
    queryTable: failed ? undefined : postgresQueryTable(data.name, output),
    stdout: !failed && typeof output.stdout === "string" ? output.stdout : undefined,
    stderr: !failed && typeof output.stderr === "string" ? output.stderr : undefined,
    error, diagnostic,
  };
}

/** Applies both persisted history and live SSE events with event-ID/sequence deduplication. */
export function replayTrace(events: ExecutionEvent[]): TraceReplay {
  const seen = new Set<string>();
  const byRun = new Map<string, number>();
  const messageByRun = new Map<string, string>();
  const steps = new Map<string, TraceStep>();
  const outputsByMessage = new Map<string, TraceResourceReference[]>();
  const errorsByMessage = new Map<string, ExecutionDiagnostic>();

  for (const event of [...events].sort((left, right) => left.run_id === right.run_id ? left.sequence - right.sequence : left.timestamp.localeCompare(right.timestamp))) {
    if (seen.has(event.event_id) || (byRun.get(event.run_id) ?? 0) >= event.sequence) continue;
    seen.add(event.event_id);
    byRun.set(event.run_id, event.sequence);
    const data = event.data;
    if (event.type === "agent.started") {
      const run = asRecord(data.run);
      if (typeof run?.assistant_message_id === "string") messageByRun.set(event.run_id, run.assistant_message_id);
      continue;
    }
    const messageId = typeof data.message_id === "string" ? data.message_id : messageByRun.get(event.run_id);
    if (!messageId) continue;
    if (["tool.started", "tool.completed", "tool.failed"].includes(event.type)) {
      const stepId = toolStepId(event);
      steps.set(stepId, toolTraceStep(event, messageId, steps.get(stepId)));
      continue;
    }
    if (["agent.failed", "agent.cancelled", "agent.interrupted", "agent.completed"].includes(event.type)) {
      const error = terminalDiagnostic(event);
      if (error) errorsByMessage.set(messageId, error);
      const runSteps = [...steps.values()].filter((step) => step.runId === event.run_id);
      for (const step of finishTrace(runSteps, event.run_id, messageId, event.timestamp, error)) {
        steps.set(step.id, step);
      }
      continue;
    }
    if (event.type === "dataset.created" || event.type === "artifact.created") {
      const resource = asRecord(data[event.type === "dataset.created" ? "dataset" : "artifact"]);
      const refs = resources(resource ? [resource] : []);
      if (refs.length) outputsByMessage.set(messageId, [...(outputsByMessage.get(messageId) ?? []), ...refs]);
    }
  }
  const stepsByMessage = new Map<string, TraceStep[]>();
  for (const step of steps.values()) stepsByMessage.set(step.messageId, [...(stepsByMessage.get(step.messageId) ?? []), step]);
  return { stepsByMessage, outputsByMessage, errorsByMessage };
}
