import type { WorkflowRunRecordDto } from "@/lib/api";

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return "under 1s";
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export const runDuration = (run: WorkflowRunRecordDto, now = Date.now()): number => (run.finished_at ? new Date(run.finished_at).getTime() : now) - new Date(run.started_at).getTime();

export function stepProgress(run: WorkflowRunRecordDto): { done: number; total: number } {
  return { done: run.results.filter((item) => item.status === "success" || item.status === "skipped" || item.status === "failed").length, total: run.results.length };
}

/** Compact, readable text for a step's input or output. */
export function pretty(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
