import { describe, expect, it } from "vitest";
import { generateFromDescription, generateFromSketch } from "./generate-workflow";

describe("generateFromDescription", () => {
  it("reads a schedule trigger and ordered linear steps", () => {
    const result = generateFromDescription("Every Friday at 4pm, pull campaign data, analyze trends, build a chart, then email the team.");
    expect(result.trigger.kind).toBe("schedule");
    expect(result.steps.map((step) => step.kind)).toEqual(["query", "analyze", "chart", "notify"]);
    expect(result.name).toBe("Pull campaign data");
  });

  it("falls back to manual and adds a query step", () => {
    const result = generateFromDescription("Summarize the report");
    expect(result.trigger.kind).toBe("manual");
    expect(result.steps[0].kind).toBe("query");
  });
});

describe("generateFromSketch", () => {
  it("orders boxes top-to-bottom, left-to-right", () => {
    const result = generateFromSketch([
      { id: "b", text: "Email team", x: 10, y: 200 },
      { id: "a", text: "Load sales data", x: 10, y: 10 },
    ]);
    expect(result.steps.map((step) => step.kind)).toEqual(["query", "notify"]);
  });
});
