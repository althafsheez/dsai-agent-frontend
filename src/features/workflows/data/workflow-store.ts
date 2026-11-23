import { ApiError, cancelWorkflowRunRecord, deleteWorkflowRecord, getWorkflowRecord, getWorkflowRunRecord, listWorkflowRecords, listWorkflowRunRecords, saveWorkflowRecord, setWorkflowRecordState, startWorkflowRunRecord } from "@/lib/api";
import type { RunStepPlan, StepKind, TriggerKind, Workflow, WorkflowRun, WorkflowState, WorkflowStep } from "../types";
import { newStep } from "../logic/generate-workflow";

// Workflows and runs are stored by the backend (shared by the team, part of the shared-data snapshot).
// The three built-in demos below show until someone saves over them.

const STEP_DURATION: Record<StepKind | "trigger", number> = { trigger: 600, query: 2600, analyze: 4200, chart: 2200, report: 3200, notify: 1200, condition: 700, custom: 1800 };
const STEP_LOGS: Record<StepKind | "trigger", (title: string) => string[]> = {
  trigger: () => ["Trigger fired", "Run context created"],
  query: () => ["Connecting to the data source", "Read 12,480 rows from 3 tables", "Schema check passed"],
  analyze: () => ["Prompting the analysis agent", "Computed 14 metrics", "Flagged 2 anomalies for review"],
  chart: () => ["Selected chart types from the data shape", "Rendered 4 charts"],
  report: () => ["Collected analysis and charts", "Wrote report.pdf (1.2 MB)"],
  notify: () => ["Resolved 5 recipients", "Message delivered"],
  condition: () => ["Evaluated condition", "Condition met, continuing"],
  custom: (title) => [`Started “${title}”`, "Completed without output"],
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function buildPlan(workflow: Pick<Workflow, "steps" | "trigger">, failStepId?: string, startedBy: TriggerKind = workflow.trigger.kind): RunStepPlan[] {
  const trigger: RunStepPlan = { step_id: "trigger", title: startedBy === "manual" ? "Manual start" : workflow.trigger.label, kind: "trigger", duration_ms: STEP_DURATION.trigger, log: STEP_LOGS.trigger("") };
  return [trigger, ...workflow.steps.map((step): RunStepPlan => {
    const fails = step.id === failStepId;
    const log = STEP_LOGS[step.kind](step.title);
    return { step_id: step.id, title: step.title, kind: step.kind, duration_ms: STEP_DURATION[step.kind], fails, log: fails ? [log[0], "Error: upstream timeout after 30 s", "Step failed, remaining steps skipped"] : log };
  })];
}

function seedWorkflows(): Workflow[] {
  const mk = (id: string, name: string, description: string, trigger: Workflow["trigger"], kinds: StepKind[], state: WorkflowState, updatedHoursAgo: number): Workflow => ({
    id, name, description, trigger, state, created_at: hoursAgo(updatedHoursAgo + 240), updated_at: hoursAgo(updatedHoursAgo),
    steps: kinds.map((kind) => ({ ...newStep(kind), id: `${id}-${kind}` })),
  });
  return [
    mk("weekly-revenue", "Weekly revenue report", "Pull revenue data, analyze trends and email a summary to the team.", { kind: "schedule", label: "Every Monday at 9:00 AM" }, ["query", "analyze", "chart", "report", "notify"], "active", 2),
    mk("customer-churn", "Customer churn monitor", "Detect churn risks when new data arrives and alert customer success.", { kind: "event", label: "When new customer data is uploaded" }, ["query", "analyze", "condition", "notify"], "active", 5),
    mk("sales-refresh", "Sales data refresh", "Refresh key sales metrics so dashboards stay current.", { kind: "schedule", label: "Daily at 6:00 AM" }, ["query", "chart"], "inactive", 30),
  ];
}

function seedRuns(workflows: Workflow[]): WorkflowRun[] {
  const run = (id: string, workflow: Workflow, hours: number, trigger: TriggerKind, failStepId?: string): WorkflowRun => ({
    id, workflow_id: workflow.id, workflow_name: workflow.name, started_at: hoursAgo(hours), trigger, plan: buildPlan(workflow, failStepId),
  });
  const [revenue, churn, refresh] = workflows;
  return [
    run("run-seed-1", revenue, 2, "schedule"), run("run-seed-2", revenue, 170, "schedule"), run("run-seed-3", revenue, 338, "schedule"),
    run("run-seed-4", churn, 5, "event"), run("run-seed-5", churn, 28, "event", `${churn.id}-analyze`), run("run-seed-6", churn, 52, "event"),
    run("run-seed-7", refresh, 30, "schedule"),
  ];
}

const asWorkflow = (record: unknown) => record as Workflow;
const asRun = (record: unknown) => record as WorkflowRun;
const SEED_IDS = new Set(["weekly-revenue", "customer-churn", "sales-refresh"]);

export async function listWorkflows(): Promise<Workflow[]> {
  let stored: Workflow[] = [];
  try { stored = (await listWorkflowRecords()).map(asWorkflow); } catch { /* API unreachable: built-in demos only */ }
  const known = new Set(stored.map((item) => item.id));
  return [...stored, ...seedWorkflows().filter((item) => !known.has(item.id))].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  try {
    return asWorkflow(await getWorkflowRecord(id));
  } catch (error) {
    if (error instanceof ApiError && error.status !== 404) throw error;
    return seedWorkflows().find((item) => item.id === id) ?? null;
  }
}

export interface WorkflowInput { id?: string; name: string; description: string; trigger: Workflow["trigger"]; steps: WorkflowStep[]; state?: WorkflowState }

export async function saveWorkflow(input: WorkflowInput): Promise<Workflow> {
  const existing = input.id ? await getWorkflow(input.id) : null;
  return asWorkflow(await saveWorkflowRecord({
    id: existing?.id ?? input.id ?? `wf-${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled workflow",
    description: input.description.trim(),
    trigger: input.trigger,
    steps: input.steps,
    state: input.state ?? existing?.state ?? "draft",
  }));
}

/** Built-in demos are not in the database yet: store them on first change. */
async function ensureStored(id: string): Promise<Workflow | null> {
  const workflow = await getWorkflow(id);
  if (workflow && SEED_IDS.has(id)) {
    try { await getWorkflowRecord(id); } catch { return saveWorkflow(workflow); }
  }
  return workflow;
}

export async function setWorkflowState(id: string, state: WorkflowState): Promise<void> {
  if (!(await ensureStored(id))) return;
  await setWorkflowRecordState(id, state);
}

export async function deleteWorkflow(id: string): Promise<void> {
  await deleteWorkflowRecord(id);
}

export async function listRuns(workflowId?: string): Promise<WorkflowRun[]> {
  let stored: WorkflowRun[] = [];
  try { stored = (await listWorkflowRunRecords(workflowId)).map(asRun); } catch { /* API unreachable */ }
  const workflows = seedWorkflows();
  const known = new Set(stored.map((item) => item.id));
  const seeded = seedRuns(workflows).filter((item) => !known.has(item.id) && (!workflowId || item.workflow_id === workflowId));
  return [...stored, ...seeded].sort((left, right) => right.started_at.localeCompare(left.started_at));
}

export async function getRun(runId: string): Promise<WorkflowRun | null> {
  try {
    return asRun(await getWorkflowRunRecord(runId));
  } catch (error) {
    if (error instanceof ApiError && error.status !== 404) throw error;
    return seedRuns(seedWorkflows()).find((item) => item.id === runId) ?? null;
  }
}

export async function startRun(workflowId: string, trigger: TriggerKind = "manual"): Promise<WorkflowRun> {
  const workflow = await ensureStored(workflowId);
  if (!workflow) throw new Error("Workflow not found.");
  return asRun(await startWorkflowRunRecord({ workflow_id: workflow.id, trigger, plan: buildPlan(workflow, undefined, trigger) }));
}

export async function cancelRun(runId: string): Promise<void> {
  await cancelWorkflowRunRecord(runId);
}
