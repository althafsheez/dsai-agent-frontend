import { buildPlan } from "../data/workflow-store";
import { viewRun } from "./run-view";
import type { RunView, StepKind, Workflow, WorkflowStep, WorkflowTrigger } from "../types";

export const FREQUENCIES = ["hourly", "daily", "weekly", "monthly"] as const;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const EVENTS = ["A new file is uploaded", "A new Google Drive file appears", "A dataset is updated", "A webhook is received"] as const;
export const OPERATORS = ["is greater than", "is less than", "equals", "contains"] as const;

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours)) return "9:00 AM";
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function scheduleLabel(config: Record<string, string> = {}): string {
  const frequency = config.frequency ?? "daily";
  const time = formatTime(config.time ?? "09:00");
  if (frequency === "hourly") return "Every hour";
  if (frequency === "weekly") return `Every ${config.day ?? "Monday"} at ${time}`;
  if (frequency === "monthly") return `Monthly on day ${config.day_of_month ?? "1"} at ${time}`;
  return `Every day at ${time}`;
}

export function triggerWithConfig(kind: WorkflowTrigger["kind"], config: Record<string, string> = {}): WorkflowTrigger {
  if (kind === "manual") return { kind, label: "Run manually" };
  if (kind === "schedule") return { kind, label: scheduleLabel(config), config };
  return { kind, label: `When ${(config.event ?? EVENTS[0]).replace(/^A /, "a ")}`, config };
}

/** One-line subtitle shown on a step card, built from what the user configured. */
export function stepSummary(step: WorkflowStep): string {
  const c = step.config ?? {};
  switch (step.kind) {
    case "query": return c.source === "drive" ? `Google Drive · ${c.drive_folder || "any folder"}` : c.dataset_name ? `Library · ${c.dataset_name}` : "Choose a data source";
    case "analyze": return step.detail.trim() ? step.detail.trim().slice(0, 70) : "Describe what to find";
    case "chart": return `${c.chart_type ?? "Auto"} chart${c.group_by ? ` by ${c.group_by}` : ""}`;
    case "report": return `${c.format ?? "PDF"} report`;
    case "notify": return `${c.channel ?? "Email"}${c.recipient ? ` · ${c.recipient}` : " · add a recipient"}`;
    case "condition": return c.field ? `${c.field} ${c.operator ?? OPERATORS[0]} ${c.value ?? ""}`.trim() : "Set a condition";
    default: return step.detail.trim().slice(0, 70) || "Custom action";
  }
}

/** Problems that would stop a real run, shown on the card like Zapier's "incomplete step" marker. */
export function stepProblem(step: WorkflowStep): string | null {
  const c = step.config ?? {};
  if (!step.title.trim()) return "Add a title";
  if (step.kind === "query" && !(c.source === "drive" || c.dataset_id)) return "Choose a data source";
  if (step.kind === "notify" && !c.recipient?.trim()) return "Add a recipient";
  if (step.kind === "condition" && !(c.field?.trim() && c.value?.trim())) return "Set the condition";
  if (step.kind === "analyze" && !step.detail.trim()) return "Describe the analysis";
  return null;
}

/** Instant "test run": every step succeeds, with the same logs a real run would write. */
export function testRun(workflow: Pick<Workflow, "trigger" | "steps">, now = Date.now()): RunView {
  const plan = buildPlan(workflow, undefined, "manual");
  const total = plan.reduce((sum, step) => sum + step.duration_ms, 0);
  const run = { id: "test", workflow_id: "test", workflow_name: "Test", started_at: new Date(now - total - 1).toISOString(), trigger: "manual" as const, plan };
  return viewRun(run, now);
}

export const KIND_LABEL: Record<StepKind, string> = { query: "Query data", analyze: "Analyze with AI", chart: "Build charts", report: "Create report", notify: "Send notification", condition: "Check a condition", custom: "Custom step" };
