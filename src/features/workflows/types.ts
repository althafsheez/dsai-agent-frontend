export type StepKind = "query" | "analyze" | "chart" | "report" | "notify" | "condition" | "custom";
export type TriggerKind = "manual" | "schedule" | "event";
export type WorkflowState = "active" | "inactive" | "draft";

export interface WorkflowStep { id: string; kind: StepKind; title: string; detail: string }
export interface WorkflowTrigger { kind: TriggerKind; label: string }

/** A workflow is always linear: one trigger, then its steps in order. */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  state: WorkflowState;
  created_at: string;
  updated_at: string;
}

/** What a run will do for one step. Status is derived from the clock, so a run survives refresh. */
export interface RunStepPlan { step_id: string; title: string; kind: StepKind | "trigger"; duration_ms: number; fails?: boolean; log: string[] }

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  started_at: string;
  trigger: TriggerKind;
  plan: RunStepPlan[];
  cancelled_at?: string | null;
}

export type RunStatus = "running" | "success" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

export interface RunStepView extends RunStepPlan {
  status: StepStatus;
  /** Milliseconds from run start until this step began. */
  offset_ms: number;
}

export interface RunView {
  run: WorkflowRun;
  status: RunStatus;
  steps: RunStepView[];
  elapsed_ms: number;
  /** Total time the run took or will take; for a failed run it ends at the failing step. */
  total_ms: number;
  finished_at: string | null;
}

export interface GeneratedWorkflow {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  /** Plain-language list of what the generator interpreted, added or reordered. */
  notes: string[];
}
