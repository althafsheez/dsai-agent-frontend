import { describe, expect, it } from "vitest";
import { scheduleLabel, stepProblem, stepSummary, testRun, triggerWithConfig } from "./step-config";
import type { WorkflowStep } from "../types";

const step = (kind: WorkflowStep["kind"], config?: Record<string, string>, detail = ""): WorkflowStep => ({ id: "s", kind, title: "T", detail, config });

describe("step config", () => {
  it("builds readable schedule labels", () => {
    expect(scheduleLabel({ frequency: "weekly", day: "Friday", time: "17:30" })).toBe("Every Friday at 5:30 PM");
    expect(scheduleLabel({ frequency: "hourly" })).toBe("Every hour");
    expect(scheduleLabel({})).toBe("Every day at 9:00 AM");
    expect(triggerWithConfig("event", { event: "A new Google Drive file appears" }).label).toBe("When a new Google Drive file appears");
  });
  it("summarises and validates steps", () => {
    expect(stepSummary(step("notify", { channel: "Slack", recipient: "#data" }))).toBe("Slack · #data");
    expect(stepProblem(step("notify"))).toBe("Add a recipient");
    expect(stepProblem(step("notify", { recipient: "a@b.c" }))).toBeNull();
    expect(stepProblem(step("query"))).toBe("Choose a data source");
    expect(stepProblem(step("query", { source: "drive" }))).toBeNull();
  });
  it("test run succeeds on every step", () => {
    const view = testRun({ trigger: { kind: "manual", label: "Run manually" }, steps: [step("query"), step("report")] });
    expect(view.status).toBe("success");
    expect(view.steps.every((item) => item.status === "success")).toBe(true);
  });
});
