import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    render(
      <AssistantMessage
        message={{
          id: "assistant-code",
          role: "assistant",
          status: "completed",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [
            {
              type: "markdown",
              content: "Here is the code:\n\n```python analysis.py\nprint('hello')\n```\n\nRun it locally.",
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Here is the code:")).toBeVisible();
    expect(screen.getByText("print").closest("pre")).toHaveTextContent("print('hello')");
    expect(screen.getByText("analysis.py")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download code" })).toBeVisible();
    expect(screen.queryByText(/```python/)).not.toBeInTheDocument();
  });

  it("renders streaming cursor inline progressively during live generation", () => {
    render(
      <AssistantMessage
        message={{
          id: "assistant-streaming",
          role: "assistant",
          status: "running",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [
            {
              type: "markdown",
              content: "Streaming response token by token...",
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Streaming response token by token...")).toBeVisible();
    expect(screen.getByTestId("streaming-cursor")).toBeInTheDocument();
  });

  it("shows thinking state when running with empty content", () => {
    render(
      <AssistantMessage
        message={{
          id: "assistant-thinking",
          role: "assistant",
          status: "running",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [{ type: "markdown", content: "" }],
        }}
      />
    );

    expect(screen.getByRole("status", { name: "Thinking" })).toBeVisible();
    expect(screen.getByText("Thinking…")).toBeVisible();
  });

  it("renders unclosed streaming code block with streaming badge", () => {
    render(
      <AssistantMessage
        message={{
          id: "assistant-streaming-code",
          role: "assistant",
          status: "running",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [
            {
              type: "markdown",
              content: "```python\nimport pandas as pd\ndf = pd.read_csv('sales.csv')",
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Streaming code")).toBeVisible();
    expect(screen.getByText("import").closest("pre")).toHaveTextContent("import pandas as pd");
  });

  it("preserves partial output and displays retry on recoverable failure", async () => {
    const handleRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistantMessage
        message={{
          id: "assistant-failed-recoverable",
          role: "assistant",
          status: "failed",
          error: "Temporary network disconnect while streaming.",
          errorType: "recoverable",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [
            {
              type: "markdown",
              content: "Calculated intermediate revenue of $42,000 before the stream dropped.",
            },
          ],
        }}
        onRetry={handleRetry}
      />
    );

    // Partial text preserved and highlighted
    expect(
      screen.getByText(/Calculated intermediate revenue of/)
    ).toBeVisible();
    expect(screen.getByText("$42,000")).toBeVisible();
    expect(screen.getByText(/before the stream dropped\./)).toBeVisible();

    // Recoverable badge & error
    expect(screen.getByText("The Gemini response failed")).toBeVisible();
    expect(screen.getByText("Recoverable failure")).toBeVisible();
    expect(screen.getByText("Temporary network disconnect while streaming.")).toBeVisible();

    // Retry button triggers callback
    const retryButton = screen.getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeVisible();
    await user.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("handles unrecoverable failures with clear notice and no retry button", () => {
    const handleRetry = vi.fn();

    render(
      <AssistantMessage
        message={{
          id: "assistant-failed-unrecoverable",
          role: "assistant",
          status: "failed",
          error: "Prompt violates content safety policy.",
          errorType: "unrecoverable",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [{ type: "markdown", content: "Partial text" }],
        }}
        onRetry={handleRetry}
      />
    );

    expect(screen.getByText("Unrecoverable response error")).toBeVisible();
    expect(screen.getByText("Unrecoverable failure")).toBeVisible();
    expect(
      screen.getByText(/This failure cannot be resolved by retrying with the same parameters/i)
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Retry/i })).not.toBeInTheDocument();
  });

  it("preserves partial output and shows recovery option on interrupted run", async () => {
    const handleRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistantMessage
        message={{
          id: "assistant-interrupted",
          role: "assistant",
          status: "interrupted",
          createdAt: "2026-11-13T00:00:00Z",
          blocks: [
            {
              type: "markdown",
              content: "Generation was interrupted by the user midway through.",
            },
          ],
        }}
        onRetry={handleRetry}
      />
    );

    expect(
      screen.getByText("Generation was interrupted by the user midway through.")
    ).toBeVisible();
    expect(screen.getByText("The Gemini response was interrupted")).toBeVisible();
    const retryButton = screen.getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeVisible();
    await user.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
