import type { RunStatus, RunStepView, RunView, WorkflowRun } from "../types";

/** Turns a stored run plan into live statuses for a given moment. */
export function viewRun(run: WorkflowRun, now = Date.now()): RunView {
  const startedMs = Date.parse(run.started_at);
  const cancelledMs = run.cancelled_at ? Date.parse(run.cancelled_at) : null;
  const elapsed = Math.max(0, (cancelledMs ?? now) - startedMs);
  let offset = 0;
  let failedAt: number | null = null;
  const steps: RunStepView[] = run.plan.map((step, index) => {
    const begin = offset;
    offset += step.duration_ms;
    let status: RunStepView["status"];
    if (failedAt !== null) status = "skipped";
    else if (elapsed >= offset) {
      status = step.fails ? "failed" : "success";
      if (step.fails) failedAt = index;
    } else if (elapsed >= begin) status = cancelledMs !== null ? "cancelled" : "running";
    else status = cancelledMs !== null ? "cancelled" : "pending";
    return { ...step, status, offset_ms: begin };
  });
  const failing = steps.find((step) => step.status === "failed");
  const total = failing ? failing.offset_ms + failing.duration_ms : offset;
  const finished = steps.every((step) => step.status === "success" || step.status === "skipped" || step.status === "failed") ;
  let status: RunStatus;
  if (failing) status = "failed";
  else if (cancelledMs !== null && !finished) status = "cancelled";
  else status = finished ? "success" : "running";
  const done = status !== "running";
  const endMs = status === "cancelled" ? cancelledMs! : startedMs + total;
  return { run, status, steps, elapsed_ms: done ? Math.min(elapsed, total) : elapsed, total_ms: total, finished_at: done ? new Date(endMs).toISOString() : null };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function formatWhen(value: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(value));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
