import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantMessage } from "./assistant-message";

describe("AssistantMessage", () => {
  it("shows total run time alongside tool time", () => {
    render(<AssistantMessage message={{
      id: "assistant-1", role: "assistant", status: "completed",
      createdAt: "2026-11-13T00:00:00Z", blocks: [],
      trace: [{ id: "step", runId: "run", messageId: "assistant-1", label: "Python", status: "completed", durationMs: 500 }],
    }} run={{
      id: "run", chat_id: "chat", user_message_id: "user", assistant_message_id: "assistant-1",
      status: "completed", model_id: "model", effort: null, client_request_id: "request",
      previous_run_id: null, created_at: "2026-11-13T00:00:00Z",
      started_at: "2026-11-13T00:00:01Z", finished_at: "2026-11-13T00:00:13Z",
      error_code: null, error_detail: null,
    }} />);
    expect(screen.getByText("Total time · 12.0 s")).toBeVisible();
    expect(screen.getByText(/500 ms/)).toBeVisible();
  });

  it("renders fenced code as a full code card with actions", () => {
    render(<AssistantMessage message={{
      id: "assistant-code",
      role: "assistant",
      status: "completed",
      createdAt: "2026-11-13T00:00:00Z",
      blocks: [{ type: "markdown", content: "Here is the code:\n\n```python analysis.py\nprint('hello')\n```\n\nRun it locally." }],
    }} />);

    expect(screen.getByText("Here is the code:")).toBeVisible();
    expect(screen.getByText("print").closest("pre")).toHaveTextContent("print('hello')");
    expect(screen.getByText("analysis.py")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download code" })).toBeVisible();
    expect(screen.queryByText(/```python/)).not.toBeInTheDocument();
  });
});
