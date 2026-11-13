import { describe, expect, it } from "vitest";
import { replayTrace } from "./execution-trace";

const event = (event_id: string, sequence: number, type: string, data: Record<string, unknown>) => ({
  event_id, run_id: "run-1", sequence, type, data, timestamp: `2026-11-13T10:00:0${sequence}Z`,
});

describe("replayTrace", () => {
  it("orders, deduplicates, and restores a completed trace with durable outputs", () => {
    const replay = replayTrace([
      event("complete", 3, "tool.completed", { step_id: "step-1", name: "execute_python", message_id: "assistant-1", duration_ms: 18, output: { stdout: "42", resources: [{ id: "dataset-1", name: "totals.csv", resource_type: "dataset" }] } }),
      event("start", 2, "tool.started", { step_id: "step-1", name: "execute_python", message_id: "assistant-1", arguments: { code: "print(42)" } }),
      event("run", 1, "agent.started", { run: { assistant_message_id: "assistant-1" } }),
      event("output", 4, "dataset.created", { message_id: "assistant-1", dataset: { id: "dataset-1", name: "totals.csv", resource_type: "dataset" } }),
      event("complete", 3, "tool.completed", { step_id: "step-1", name: "execute_python", message_id: "assistant-1" }),
    ]);
    const step = replay.stepsByMessage.get("assistant-1")?.[0];
    expect(step).toMatchObject({ id: "step-1", status: "completed", code: "print(42)", stdout: "42", durationMs: 18 });
    expect(replay.outputsByMessage.get("assistant-1")).toEqual([{ id: "dataset-1", name: "totals.csv", resourceType: "dataset", sizeBytes: undefined }]);
  });
});
