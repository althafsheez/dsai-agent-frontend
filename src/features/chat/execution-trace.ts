import type { ExecutionEvent } from "@/lib/api";
import type { TraceResourceReference, TraceStep } from "./types";

export type TraceReplay = {
  stepsByMessage: Map<string, TraceStep[]>;
  outputsByMessage: Map<string, TraceResourceReference[]>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

/** Applies both persisted history and live SSE events with event-ID/sequence deduplication. */
export function replayTrace(events: ExecutionEvent[]): TraceReplay {
  const seen = new Set<string>();
  const byRun = new Map<string, number>();
  const messageByRun = new Map<string, string>();
  const steps = new Map<string, TraceStep>();
  const outputsByMessage = new Map<string, TraceResourceReference[]>();

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
    if (event.type === "tool.started") {
      const stepId = typeof data.step_id === "string" ? data.step_id : `${event.run_id}:${String(data.tool_call_id ?? event.event_id)}`;
      const argumentsValue = asRecord(data.arguments) ?? {};
      steps.set(stepId, {
        id: stepId,
        runId: event.run_id,
        messageId,
        label: label(typeof data.name === "string" ? data.name : "Tool"),
        summary: typeof data.summary === "string" ? data.summary : undefined,
        detail: "Running",
        status: "running",
        startedAt: event.timestamp,
        code: typeof data.code === "string" ? data.code : typeof argumentsValue.code === "string" ? argumentsValue.code : undefined,
        sql: typeof data.sql === "string" ? data.sql : typeof argumentsValue.sql === "string" ? argumentsValue.sql : undefined,
        inputs: resources(data.input_resources),
      });
      continue;
    }
    if (event.type === "tool.completed" || event.type === "tool.failed") {
      const stepId = typeof data.step_id === "string" ? data.step_id : `${event.run_id}:${String(data.tool_call_id ?? event.event_id)}`;
      const output = asRecord(data.output) ?? {};
      const prior = steps.get(stepId);
      const outputResources = resources(data.resources ?? output.resources);
      steps.set(stepId, {
        ...(prior ?? { id: stepId, runId: event.run_id, messageId, label: label(typeof data.name === "string" ? data.name : "Tool"), status: "running" as const }),
        status: event.type === "tool.failed" ? "failed" : "completed",
        summary: typeof data.summary === "string" ? data.summary : prior?.summary,
        detail: event.type === "tool.failed" ? String(data.error ?? output.error ?? "Tool failed") : "Completed",
        completedAt: event.timestamp,
        durationMs: typeof data.duration_ms === "number" ? data.duration_ms : undefined,
        outputs: outputResources,
        results: output.rows ?? output.results ?? output.text,
        stdout: typeof output.stdout === "string" ? output.stdout : undefined,
        stderr: typeof output.stderr === "string" ? output.stderr : undefined,
        error: event.type === "tool.failed" ? String(data.error ?? output.error ?? "Tool failed") : undefined,
      });
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
  return { stepsByMessage, outputsByMessage };
}
