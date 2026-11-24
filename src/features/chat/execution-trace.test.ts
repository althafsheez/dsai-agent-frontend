import { describe, expect, it } from "vitest";
import { ApiError, type ExecutionEvent } from "@/lib/api";
import { requestDiagnostic } from "./execution-diagnostic";
import { finishTrace, replayTrace } from "./execution-trace";

const timestamp = "2026-11-23T12:00:00Z";

function event(type: string, sequence: number, data: Record<string, unknown> = {}): ExecutionEvent {
  return { event_id: `event-${sequence}`, type, sequence, timestamp, run_id: "run-1", data };
}

const started = event("agent.started", 1, { run: { assistant_message_id: "message-1" } });
const toolStarted = event("tool.started", 2, { step_id: "step-1", name: "query_database" });
const toolCompleted = event("tool.completed", 3, { step_id: "step-1", name: "query_database" });

describe("execution diagnostic replay", () => {
  it("keeps a completed SQL step and places a later Gemini failure on a separate trace row", () => {
    const error = {
      component: "Gemini API", code: "gemini_http_503", category: "unavailable", message: "Service unavailable",
      stage: "model_generation", retryable: true, http_status: 503, turn: 2,
    };
    const failed = event("agent.failed", 4, { error });
    const replay = replayTrace([failed, started, toolStarted, toolCompleted, failed]);
    expect(replay.errorsByMessage.get("message-1")).toEqual(error);
    expect(replay.stepsByMessage.get("message-1")).toMatchObject([
      { id: "step-1", status: "completed" },
      { id: "run-1:terminal", label: "Gemini API", status: "failed", diagnostic: error },
    ]);
  });

  it("marks an interrupted tool stopped and attaches an execution error to a matching step", () => {
    const error = {
      component: "PostgreSQL", code: "postgres_timeout", category: "timeout", message: "Query timed out",
      stage: "query", tool: "query_database", step_id: "step-1", retryable: true, duration_ms: 500,
    };
    const running = replayTrace([started, toolStarted]).stepsByMessage.get("message-1") ?? [];
    expect(finishTrace(running, "run-1", "message-1", timestamp, error)).toMatchObject([
      { id: "step-1", status: "failed", diagnostic: error, durationMs: 500 },
    ]);

    const cancelled = replayTrace([started, toolStarted, event("agent.cancelled", 3)]);
    expect(cancelled.stepsByMessage.get("message-1")).toMatchObject([
      { id: "step-1", status: "failed", diagnostic: { code: "run_cancelled" } },
    ]);
  });

  it("keeps tool failures on the tool row after a successful final response", () => {
    const error = {
      component: "E2B", code: "e2b_python_failed", category: "python_execution", message: "Python execution failed",
      stage: "python_execution", tool: "execute_python", step_id: "step-1", retryable: false,
    };
    const replay = replayTrace([started, toolStarted, event("tool.failed", 3, {
      step_id: "step-1", diagnostic: error, output: { stderr: "old untrusted exception body" },
    }), event("agent.completed", 4)]);
    const steps = replay.stepsByMessage.get("message-1");
    expect(steps).toMatchObject([{ id: "step-1", status: "failed", diagnostic: error }]);
    expect(steps?.[0].stderr).toBeUndefined();
    expect(replay.errorsByMessage.size).toBe(0);
  });

  it("uses a safe FastAPI diagnostic for a failed initial HTTP request", () => {
    const error = requestDiagnostic(
      new ApiError("Authorization: Bearer hidden", 422, "invalid_model", "safe-request-id"), performance.now(), null,
    );
    expect(error).toMatchObject({
      component: "FastAPI", http_status: 422, code: "invalid_model", stage: "start_run",
      message: "The selected model is unavailable", request_id: "safe-request-id", retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain("hidden");
  });
});
