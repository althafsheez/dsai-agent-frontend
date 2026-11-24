import { describe, expect, it } from "vitest";
import { datasetIdsOf, describeSchedule, makeTrigger, newStep, problems, promptSteps } from "./steps";
import { TEMPLATES, templateToDraft } from "./templates";

describe("workflow steps", () => {
  it("describes schedules in plain words", () => {
    expect(describeSchedule(makeTrigger("manual"))).toBe("Runs when you start it");
    expect(describeSchedule(makeTrigger("daily"))).toBe("Every day at 9:00 AM");
    expect(describeSchedule({ kind: "schedule", config: { frequency: "weekly", day: "Friday", time: "17:30" } })).toBe("Every Friday at 5:30 PM");
    expect(describeSchedule({ kind: "schedule", config: { frequency: "monthly", day_of_month: "5", time: "00:05" } })).toBe("Monthly on day 5 at 12:05 AM");
    expect(describeSchedule(makeTrigger("hourly"))).toBe("Every hour");
  });

  it("keeps the time when the frequency changes", () => {
    const daily = { kind: "schedule" as const, config: { frequency: "daily", time: "07:15" } };
    expect(makeTrigger("weekly", daily).config).toMatchObject({ frequency: "weekly", time: "07:15" });
  });

  it("says what is missing before a workflow can be saved", () => {
    expect(problems("", [])).toEqual(["Give the workflow a name.", "Add at least one step."]);
    const ai = { ...newStep("ai"), detail: "Summarise" };
    expect(problems("x", [ai])).toEqual([]);
    expect(problems("x", [{ ...newStep("script"), detail: "Summarise" }])).toContain("Attach a dataset to the step that uses it.");
    const data = newStep("data");
    expect(problems("x", [data, ai]).join(" ")).toContain("choose a saved connection");
    expect(problems("x", [newStep("data", ["d1"]), ai])).toEqual([]);
    expect(problems("x", [newStep("data", ["d1"]), { ...newStep("condition"), config: { operator: "greater", value: "abc" } }])[0]).toContain("not a number");
  });

  it("builds the prompt workflow as data, AI question, delivery", () => {
    const steps = promptSteps("Which region is best?", ["d1"]);
    expect(steps.map((step) => step.kind)).toEqual(["data", "ai", "notify"]);
    expect(steps[1].detail).toBe("Which region is best?");
    expect(datasetIdsOf(steps)).toEqual(["d1"]);
  });

  it("offers templates that are complete once data is chosen", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const template of TEMPLATES) {
      const draft = templateToDraft(template);
      const withData = draft.steps.map((step) => (step.kind === "data" ? { ...step, config: { dataset_ids: ["d"] } } : step));
      expect(problems(draft.name, withData), template.id).toEqual([]);
      expect(new Set(draft.steps.map((step) => step.id)).size).toBe(draft.steps.length);
    }
  });
});
