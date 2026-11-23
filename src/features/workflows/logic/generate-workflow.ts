import type { GeneratedWorkflow, StepKind, TriggerKind, WorkflowStep, WorkflowTrigger } from "../types";

// Demo generator: keyword rules stand in for the model call until a workflow-planning endpoint exists.
const STEP_RULES: Array<{ kind: StepKind; title: string; words: RegExp }> = [
  { kind: "query", title: "Query data", words: /\b(fetch|pull|query|load|read|import|database|sql|dataset|refresh|sync|collect)\b/i },
  { kind: "analyze", title: "Analyze with AI", words: /\b(analy[sz]e|analysis|trend|insight|summar|detect|anomal|forecast|compare|churn|classif)/i },
  { kind: "chart", title: "Build charts", words: /\b(chart|graph|plot|visual|dashboard)/i },
  { kind: "report", title: "Create report", words: /\b(report|pdf|document|write[- ]?up|summary doc)/i },
  { kind: "notify", title: "Send notification", words: /\b(email|mail|slack|notify|alert|send|message|share|post)\b/i },
  { kind: "condition", title: "Check a condition", words: /\b(if|only when|condition|threshold|unless)\b/i },
];

const TRIGGER_RULES: Array<{ kind: TriggerKind; words: RegExp }> = [
  { kind: "schedule", words: /\b(every|daily|weekly|monthly|hourly|each (day|week|month|morning)|at \d{1,2}(:\d{2})?\s?(am|pm)?|cron|schedule)/i },
  { kind: "event", words: /\b(when|whenever|on new|new (file|data|row|issue)|webhook|arrives?|uploaded|is created)\b/i },
];

let counter = 0;
const stepId = () => `step-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newStep(kind: StepKind, title?: string, detail = ""): WorkflowStep {
  const rule = STEP_RULES.find((item) => item.kind === kind);
  return { id: stepId(), kind, title: title ?? rule?.title ?? "Custom step", detail };
}

export function classifyStep(text: string): StepKind {
  return STEP_RULES.find((rule) => rule.words.test(text))?.kind ?? "custom";
}

export function classifyTrigger(text: string): WorkflowTrigger {
  const rule = TRIGGER_RULES.find((item) => item.words.test(text));
  if (!rule) return { kind: "manual", label: "Run manually" };
  const when = text.match(/\b(every [^,.;]+|daily[^,.;]*|weekly[^,.;]*|monthly[^,.;]*|hourly[^,.;]*|when [^,.;]+|whenever [^,.;]+)/i)?.[0].trim();
  return { kind: rule.kind, label: when ? when[0].toUpperCase() + when.slice(1) : rule.kind === "schedule" ? "On a schedule" : "When an event occurs" };
}

function titleCase(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 60).replace(/^./, (letter) => letter.toUpperCase());
}

/** "Every Monday pull sales, analyze trends, then email the team" -> trigger + ordered linear steps. */
export function generateFromDescription(prompt: string): GeneratedWorkflow {
  const text = prompt.trim();
  const notes: string[] = [];
  const trigger = classifyTrigger(text);
  notes.push(trigger.kind === "manual" ? "No schedule or event found, so the workflow runs manually." : `Trigger read as ${trigger.kind}: ${trigger.label}.`);
  const clauses = text.split(/,|;|\bthen\b|\band then\b|\band\b(?=\s+(?:email|mail|slack|notify|alert|send|share|post|build|create|write|analy|chart|report))|\bafter that\b|\bfinally\b|\.(?=\s|$)/i).map((part) => part.trim()).filter(Boolean);
  const steps: WorkflowStep[] = [];
  for (const clause of clauses) {
    const kind = classifyStep(clause);
    if (kind === "custom" && clause === clauses[0] && trigger.kind !== "manual") continue;
    if (steps.some((step) => step.kind === kind && kind !== "custom")) continue;
    steps.push(newStep(kind, kind === "custom" ? titleCase(clause) : undefined, clause));
  }
  if (!steps.length) {
    steps.push(newStep("analyze", undefined, text), newStep("report"));
    notes.push("The description named no clear actions, so an analysis and a report step were added as a starting point.");
  }
  if (steps[0].kind !== "query") {
    steps.unshift(newStep("query", undefined, "Load the data this workflow works on."));
    notes.push("Added a Query data step first so later steps have data to work on.");
  }
  const order: StepKind[] = ["query", "condition", "analyze", "chart", "report", "notify"];
  const sorted = [...steps].sort((left, right) => (left.kind === "custom" || right.kind === "custom") ? 0 : order.indexOf(left.kind) - order.indexOf(right.kind));
  if (sorted.some((step, index) => step !== steps[index])) notes.push("Reordered steps so notifications come last.");
  const afterTrigger = text.replace(new RegExp(`^\\s*${trigger.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s,:;-]*`, "i"), "");
  const firstClause = afterTrigger.split(/[.,;\n]|\bthen\b/i)[0].trim().split(/\s+/).slice(0, 6).join(" ");
  const name = titleCase(firstClause || sorted[0]?.title || "") || "New workflow";
  return { name: name.length > 48 ? `${name.slice(0, 45)}…` : name, description: text, trigger, steps: sorted, notes };
}

export interface SketchBox { id: string; text: string; x: number; y: number }

/** Reads a sketch left-to-right, top-to-bottom and straightens it into one linear workflow. */
export function generateFromSketch(boxes: SketchBox[]): GeneratedWorkflow {
  const filled = boxes.filter((box) => box.text.trim());
  const notes: string[] = [];
  if (!filled.length) return { name: "New workflow", description: "", trigger: { kind: "manual", label: "Run manually" }, steps: [], notes: ["The sketch has no labelled boxes yet."] };
  const ordered = [...filled].sort((left, right) => Math.round(left.y / 90) - Math.round(right.y / 90) || left.x - right.x);
  if (ordered.some((box, index) => box !== filled[index])) notes.push("Reordered boxes by their position on the canvas (top to bottom, then left to right).");
  const triggerBox = ordered.find((box) => classifyTrigger(box.text).kind !== "manual");
  const trigger = triggerBox ? classifyTrigger(triggerBox.text) : { kind: "manual" as const, label: "Run manually" };
  notes.push(triggerBox ? `Used “${triggerBox.text.trim()}” as the trigger.` : "No trigger box found, so the workflow runs manually.");
  const steps = ordered.filter((box) => box !== triggerBox).map((box) => newStep(classifyStep(box.text), titleCase(box.text), box.text.trim()));
  const customCount = steps.filter((step) => step.kind === "custom").length;
  if (customCount) notes.push(`${customCount} box${customCount > 1 ? "es were" : " was"} not recognised and kept as custom steps.`);
  if (steps[0]?.kind !== "query" && steps.length) { steps.unshift(newStep("query", undefined, "Load the data this workflow works on.")); notes.push("Added a Query data step first."); }
  return { name: titleCase(filled[0].text), description: filled.map((box) => box.text.trim()).join(" → "), trigger, steps, notes };
}

export function describeTrigger(trigger: WorkflowTrigger): string {
  return trigger.kind === "manual" ? "Manual" : trigger.kind === "schedule" ? `Schedule · ${trigger.label}` : `Event · ${trigger.label}`;
}
