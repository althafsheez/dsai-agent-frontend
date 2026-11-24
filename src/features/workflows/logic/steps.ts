import type { WorkflowRecordDto, WorkflowStepDto, WorkflowStepKind, WorkflowTriggerDto } from "@/lib/api";

export interface StepKindInfo { kind: WorkflowStepKind; label: string; hint: string; needs: string }

/** What a person can add to a flow. The `needs` line is shown in the picker so nobody has to guess what a step wants. */
export const STEP_KINDS: StepKindInfo[] = [
  { kind: "data", label: "Get data", hint: "Read one or more datasets from your Library.", needs: "Needs: a dataset" },
  { kind: "script", label: "Calculate (Python)", hint: "The AI writes a Python script that computes numbers, rankings or comparisons.", needs: "Needs: what to calculate" },
  { kind: "ai", label: "Ask the AI", hint: "The AI reads the data and earlier results and answers in plain words.", needs: "Needs: a question" },
  { kind: "condition", label: "Only if…", hint: "Stop the run quietly unless the previous number passes a test.", needs: "Needs: a test and a number" },
  { kind: "notify", label: "Send the result", hint: "Deliver the result in the app.", needs: "Needs: nothing" },
];

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

/** The problems that would stop a run, in plain words; empty means it can be saved and activated. */
export function problems(name: string, steps: WorkflowStepDto[]): string[] {
  const issues: string[] = [];
  if (!name.trim()) issues.push("Give the workflow a name.");
  if (!steps.length) issues.push("Add at least one step.");
  steps.forEach((step, index) => {
    const label = `Step ${index + 1} (${step.title || kindInfo(step.kind).label})`;
    const config = step.config ?? {};
    if (step.kind === "data" && !(Array.isArray(config.dataset_ids) && config.dataset_ids.length)) issues.push(`${label}: choose a dataset.`);
    if (step.kind === "script" && !step.detail.trim()) issues.push(`${label}: say what to calculate.`);
    if (step.kind === "ai" && !step.detail.trim()) issues.push(`${label}: write the question for the AI.`);
    if (step.kind === "condition" && Number.isNaN(Number(config.value))) issues.push(`${label}: the number to compare with is not a number.`);
  });
  const firstData = steps.findIndex((step) => step.kind === "data");
  const firstUse = steps.findIndex((step) => step.kind === "script" || step.kind === "ai");
  if (firstUse >= 0 && (firstData < 0 || firstData > firstUse)) issues.push("Put a “Get data” step before the steps that use it.");
  return issues;
}

export const needsScript = (step: WorkflowStepDto) => step.kind === "script" && !(typeof step.config?.script === "string" && step.config.script) ;

export function datasetIdsOf(steps: WorkflowStepDto[]): string[] {
  const ids = new Set<string>();
  for (const step of steps) if (step.kind === "data" && Array.isArray(step.config?.dataset_ids)) for (const id of step.config.dataset_ids as string[]) ids.add(id);
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
