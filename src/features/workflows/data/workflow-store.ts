import { readMockEnvelope, updateMockEnvelope } from "@/lib/mock/mock-store";
import type { RunStepPlan, StepKind, TriggerKind, Workflow, WorkflowRun, WorkflowState, WorkflowStep } from "../types";
import { newStep } from "../logic/generate-workflow";

// Demo store: workflows and runs live in the shared mock envelope until a workflow API exists.
interface WorkflowEnvelope { workflows: Workflow[]; runs: WorkflowRun[] }

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

function read(): WorkflowEnvelope {
  const stored = readMockEnvelope().workflowDemo as WorkflowEnvelope | undefined;
  if (stored && Array.isArray(stored.workflows) && Array.isArray(stored.runs)) return stored;
  const workflows = seedWorkflows();
  const seeded = { workflows, runs: seedRuns(workflows) };
  write(seeded);
  return seeded;
}

function write(value: WorkflowEnvelope) {
  try { updateMockEnvelope((current) => ({ ...current, workflowDemo: value })); } catch { /* storage unavailable: the demo keeps working per session */ }
}

const sleep = <T,>(value: T) => Promise.resolve(value);

export async function listWorkflows(): Promise<Workflow[]> {
  return sleep([...read().workflows].sort((left, right) => right.updated_at.localeCompare(left.updated_at)));
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  return sleep(read().workflows.find((workflow) => workflow.id === id) ?? null);
}

export interface WorkflowInput { id?: string; name: string; description: string; trigger: Workflow["trigger"]; steps: WorkflowStep[]; state?: WorkflowState }

export async function saveWorkflow(input: WorkflowInput): Promise<Workflow> {
  const data = read();
  const now = new Date().toISOString();
  const existing = input.id ? data.workflows.find((workflow) => workflow.id === input.id) : undefined;
  const saved: Workflow = {
    id: existing?.id ?? `wf-${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled workflow",
    description: input.description.trim(),
    trigger: input.trigger,
    steps: input.steps,
    state: input.state ?? existing?.state ?? "draft",
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  write({ ...data, workflows: existing ? data.workflows.map((workflow) => (workflow.id === saved.id ? saved : workflow)) : [saved, ...data.workflows] });
  return sleep(saved);
}

export async function setWorkflowState(id: string, state: WorkflowState): Promise<void> {
  const data = read();
  write({ ...data, workflows: data.workflows.map((workflow) => (workflow.id === id ? { ...workflow, state, updated_at: new Date().toISOString() } : workflow)) });
}

export async function deleteWorkflow(id: string): Promise<void> {
  const data = read();
  write({ workflows: data.workflows.filter((workflow) => workflow.id !== id), runs: data.runs.filter((item) => item.workflow_id !== id) });
}

export async function listRuns(workflowId?: string): Promise<WorkflowRun[]> {
  return sleep(read().runs.filter((item) => !workflowId || item.workflow_id === workflowId).sort((left, right) => right.started_at.localeCompare(left.started_at)));
}

export async function getRun(runId: string): Promise<WorkflowRun | null> {
  return sleep(read().runs.find((item) => item.id === runId) ?? null);
}

export async function startRun(workflowId: string, trigger: TriggerKind = "manual"): Promise<WorkflowRun> {
  const data = read();
  const workflow = data.workflows.find((item) => item.id === workflowId);
  if (!workflow) throw new Error("Workflow not found.");
  const created: WorkflowRun = { id: `run-${Date.now().toString(36)}`, workflow_id: workflow.id, workflow_name: workflow.name, started_at: new Date().toISOString(), trigger, plan: buildPlan(workflow, undefined, trigger) };
  write({ ...data, runs: [created, ...data.runs] });
  return sleep(created);
}

export async function cancelRun(runId: string): Promise<void> {
  const data = read();
  write({ ...data, runs: data.runs.map((item) => (item.id === runId ? { ...item, cancelled_at: new Date().toISOString() } : item)) });
}
