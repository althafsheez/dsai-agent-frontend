import type { WorkflowAction, WorkflowRecordDto, WorkflowStepDto, WorkflowStepKind, WorkflowTriggerDto } from "@/lib/api";

export interface StepKindInfo { kind: WorkflowStepKind; label: string; hint: string; needs: string }

/** What a person can add to a flow. The `needs` line is shown in the picker so nobody has to guess what a step wants. */
export const STEP_KINDS: StepKindInfo[] = [
  { kind: "data", label: "Extension", hint: "Select a database or app connection.", needs: "Needs: a saved connection" },
  { kind: "script", label: "Calculate (Python)", hint: "The AI writes a Python script that computes numbers, rankings or comparisons.", needs: "Needs: what to calculate" },
  { kind: "ai", label: "Ask the AI", hint: "The AI reads the data and earlier results and answers in plain words.", needs: "Needs: a question" },
  { kind: "condition", label: "Only if…", hint: "Stop the run quietly unless the previous number passes a test.", needs: "Needs: a test and a number" },
  { kind: "notify", label: "Send the result", hint: "Deliver the result in the app.", needs: "Needs: nothing" },
  { kind: "human", label: "Human Review", hint: "Request a decision before continuing.", needs: "Needs: review instructions" },
];

export function draftOnlyReason(steps: WorkflowStepDto[]): string | undefined {
  if (steps.some((step) => step.kind === "human")) return "Workflows with Human Review steps can only be saved as drafts.";
  if (steps.some((step) => step.kind === "data" && step.config?.connection_id && step.config.connection_provider !== "postgresql")) {
    return "Only PostgreSQL connections support workflow actions.";
  }
  if (steps.some((step) => step.kind === "data" && step.config?.connection_id && !appliedAction(step.config, step.detail))) {
    return "Generate and apply a PostgreSQL action before running.";
  }
}

export function appliedAction(config: Record<string, unknown>, instructions: string): WorkflowAction | undefined {
  const action = config.action as Partial<WorkflowAction> | undefined;
  if (action?.provider === "postgresql" && action.connection_id === config.connection_id
    && config.connection_provider === "postgresql" && action.instructions === instructions.trim()
    && action.operation === "query" && action.validation === "valid" && typeof action.arguments?.sql === "string") {
    return action as WorkflowAction;
  }
}

export const kindInfo = (kind: string): StepKindInfo => STEP_KINDS.find((item) => item.kind === kind) ?? { kind: "ai", label: kind, hint: "", needs: "" };

export const newStepId = () => `s-${Math.random().toString(36).slice(2, 10)}`;

export function newStep(kind: WorkflowStepKind, datasetIds: string[] = []): WorkflowStepDto {
  const base = { id: newStepId(), kind, title: kindInfo(kind).label.replace("…", ""), detail: "", config: {} as Record<string, unknown> };
  if (kind === "data") base.config = { dataset_ids: datasetIds };
  if (kind === "condition") base.config = { operator: "greater", value: "0" };
  if (kind === "notify") base.config = { recipient: "me" };
  return base;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const FREQUENCIES = [{ value: "manual", label: "Only when I run it" }, { value: "hourly", label: "Every hour" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "Every month" }];

export function frequencyOf(trigger: WorkflowTriggerDto): string {
  return trigger.kind === "schedule" ? trigger.config?.frequency ?? "daily" : "manual";
}

export function makeTrigger(frequency: string, previous?: WorkflowTriggerDto): WorkflowTriggerDto {
  if (frequency === "manual") return { kind: "manual", config: {} };
  const config = { time: "09:00", day: "Monday", day_of_month: "1", ...(previous?.kind === "schedule" ? previous.config : {}), frequency };
  return { kind: "schedule", config };
}

export function describeSchedule(trigger: WorkflowTriggerDto): string {
  if (trigger.kind !== "schedule") return "Runs when you start it";
  const { frequency = "daily", time = "09:00", day = "Monday", day_of_month: dom = "1" } = trigger.config ?? {};
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const clock = `${(hours % 12) || 12}:${String(minutes || 0).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  if (frequency === "hourly") return "Every hour";
  if (frequency === "weekly") return `Every ${day} at ${clock}`;
  if (frequency === "monthly") return `Monthly on day ${dom} at ${clock}`;
  return `Every day at ${clock}`;
}

/** Issues that block activation or execution. Drafts can be incomplete. */
export function problems(name: string, steps: WorkflowStepDto[]): string[] {
  const issues: string[] = [];
  if (!name.trim()) issues.push("Give the workflow a name.");
  if (!steps.length) issues.push("Add at least one step.");
  const draftOnly = draftOnlyReason(steps);
  if (draftOnly) issues.push(draftOnly);
  steps.forEach((step, index) => {
    const label = `Step ${index + 1} (${step.title || kindInfo(step.kind).label})`;
    const config = step.config ?? {};
    if (step.kind === "data" && !config.connection_id && !(Array.isArray(config.dataset_ids) && config.dataset_ids.length)) issues.push(`${label}: choose a saved connection.`);
    if (step.kind === "script" && !step.detail.trim()) issues.push(`${label}: say what to calculate.`);
    if (step.kind === "ai" && !step.detail.trim()) issues.push(`${label}: write the question for the AI.`);
    if (!STEP_KINDS.some((item) => item.kind === step.kind)) issues.push(`${label}: choose a supported step type.`);
    if (step.kind === "condition" && (!String(config.value ?? "").trim() || !Number.isFinite(Number(config.value)))) issues.push(`${label}: the number to compare with is not a number.`);
  });
  const firstData = steps.findIndex((step) => step.kind === "data");
  const firstUse = steps.findIndex((step) => step.kind === "script" && !(Array.isArray(step.config?.dataset_ids) && step.config.dataset_ids.length));
  if (firstUse >= 0 && (firstData < 0 || firstData > firstUse)) issues.push("Attach a dataset to the step that uses it.");
  return issues;
}

export const attachedIds = (step?: WorkflowStepDto) => Array.isArray(step?.config?.dataset_ids) ? step.config.dataset_ids as string[] : [];
export function scriptDatasetIds(steps: WorkflowStepDto[], index: number) {
  const direct = attachedIds(steps[index]);
  return direct.length ? direct : attachedIds(steps.slice(0, index).reverse().find((entry) => entry.kind === "data"));
}

export function scriptReady(step: WorkflowStepDto, datasetIds: string[]) {
  const builtWith = step.config?.script_dataset_ids;
  return Boolean(step.config?.script) && (!step.config?.script_for || step.config.script_for === step.detail) &&
    (!Array.isArray(builtWith) || (builtWith.length === datasetIds.length && builtWith.every((id, index) => id === datasetIds[index])));
}

export function executionIssues(name: string, steps: WorkflowStepDto[]) {
  const issues = problems(name, steps);
  if (steps.some((step, index) => step.kind === "script" && !scriptReady(step, scriptDatasetIds(steps, index)))) {
    issues.push("Build each Custom step with its current datasets before running.");
  }
  return issues;
}

export function datasetIdsOf(steps: WorkflowStepDto[]): string[] {
  const ids = new Set<string>();
  for (const step of steps) if (Array.isArray(step.config?.dataset_ids)) for (const id of step.config.dataset_ids as string[]) ids.add(id);
  return [...ids];
}

/** The simplest workflow: read the data, ask the AI the same question every run, deliver the answer. */
export function promptSteps(prompt: string, datasetIds: string[]): WorkflowStepDto[] {
  return [
    { ...newStep("data", datasetIds), title: "Get the data" },
    { ...newStep("ai"), title: "Ask the AI", detail: prompt },
    { ...newStep("notify"), title: "Send the answer" },
  ];
}

export type RecordLike = Pick<WorkflowRecordDto, "state">;
