import type { WorkflowStepDto, WorkflowTriggerDto } from "@/lib/api";
import { makeTrigger, newStep } from "./steps";

export interface WorkflowTemplate {
  id: string; name: string; description: string; prompt: string; trigger: WorkflowTriggerDto;
  flow: Array<{ kind: "data" | "script" | "ai" | "condition" | "notify"; title: string; detail?: string; config?: Record<string, unknown> }>;
}

/**
 * Ready-made workflows to start from. Importing one opens the builder with the steps filled in and no dataset chosen;
 * nothing runs until the person picks their data, builds the scripts and saves it.
 */
export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "daily-sales-summary", name: "Daily sales summary", description: "Every morning: total the sales and get a short written summary.", prompt: "Summarise yesterday's sales: total revenue, best and worst region, and anything unusual.",
    trigger: makeTrigger("daily"),
    flow: [{ kind: "data", title: "Get the sales data" }, { kind: "script", title: "Total revenue by region", detail: "Total revenue overall and by region, ranked from highest to lowest." }, { kind: "ai", title: "Write the summary", detail: "Write a three-sentence summary of the sales figures, naming the best and worst region." }, { kind: "notify", title: "Send the summary" }],
  },
  {
    id: "weekly-data-quality", name: "Weekly data quality check", description: "Every Monday: look for empty cells, duplicates and odd values.", prompt: "Check the dataset for missing values, duplicate rows and outliers.",
    trigger: makeTrigger("weekly"),
    flow: [{ kind: "data", title: "Get the data" }, { kind: "script", title: "Count the problems", detail: "For every column count empty cells, and count fully duplicated rows." }, { kind: "ai", title: "Explain what to fix", detail: "Explain which columns have the most problems and what to fix first." }, { kind: "notify", title: "Send the report" }],
  },
  {
    id: "threshold-alert", name: "Alert when a number drops", description: "Every hour: check a key number and only tell me if it is too low.", prompt: "Alert me when total revenue falls below the target.",
    trigger: makeTrigger("hourly"),
    flow: [{ kind: "data", title: "Get the data" }, { kind: "script", title: "Total revenue", detail: "Add up the revenue column and return it as one number." }, { kind: "condition", title: "Only if below target", config: { operator: "less", value: "1000" } }, { kind: "notify", title: "Send the alert" }],
  },
  {
    id: "monthly-report", name: "Monthly performance report", description: "On the 1st of each month: a ranked table and an AI commentary.", prompt: "Write a monthly performance report with a ranked table and what changed.",
    trigger: { kind: "schedule", config: { frequency: "monthly", day_of_month: "1", time: "08:00" } },
    flow: [{ kind: "data", title: "Get the data" }, { kind: "script", title: "Rank the results", detail: "Rank the main categories by their total value and return a table." }, { kind: "ai", title: "Write commentary", detail: "Write a short commentary on the ranking: leaders, laggards and one recommendation." }, { kind: "notify", title: "Send the report" }],
  },
  {
    id: "two-file-check", name: "Two-file reconciliation", description: "Daily: compare two files that should agree and flag the differences.", prompt: "Compare the two datasets on their shared key and list the rows whose values differ.",
    trigger: makeTrigger("daily"),
    flow: [{ kind: "data", title: "Get both files" }, { kind: "script", title: "Find the differences", detail: "Match rows across the datasets on the shared id column and list rows where the numeric values differ, with both values." }, { kind: "ai", title: "Explain the gaps", detail: "Explain the differences found and say which file is more likely to be right and why." }, { kind: "notify", title: "Send the findings" }],
  },
];

export function templateToDraft(template: WorkflowTemplate): { name: string; description: string; prompt: string; trigger: WorkflowTriggerDto; steps: WorkflowStepDto[] } {
  return {
    name: template.name, description: template.description, prompt: template.prompt, trigger: template.trigger,
    steps: template.flow.map((item) => ({ ...newStep(item.kind), title: item.title, detail: item.detail ?? "", config: { ...newStep(item.kind).config, ...item.config } })),
  };
}
