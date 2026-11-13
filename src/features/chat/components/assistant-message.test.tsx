import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantMessage } from "./assistant-message";

describe("AssistantMessage", () => {
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
