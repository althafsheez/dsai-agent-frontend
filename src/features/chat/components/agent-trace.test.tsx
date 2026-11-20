import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTrace } from "./agent-trace";
import type { TraceStep } from "../types";

const mockSteps: TraceStep[] = [
  {
    id: "step-1",
    runId: "run-1",
    messageId: "msg-1",
    label: "Inspect Dataset",
    summary: "Load schema for sales.csv",
    status: "completed",
    startedAt: "2026-11-19T10:00:00Z",
    completedAt: "2026-11-19T10:00:01Z",
    durationMs: 120,
    inputs: [{ id: "ds-1", name: "sales.csv", resourceType: "dataset" }],
    results: { columns: ["date", "revenue"], rows: 1250 },
  },
  {
    id: "step-2",
    runId: "run-1",
    messageId: "msg-1",
    label: "Execute Python",
    summary: "Initial trend calculation attempt",
    status: "failed",
    startedAt: "2026-11-19T10:00:02Z",
    completedAt: "2026-11-19T10:00:03Z",
    durationMs: 250,
    code: "df['rev'] = df['revenue'].astype(float)",
    stderr: "KeyError: 'revenue'",
    error: "KeyError: 'revenue' column missing in projection",
  },
  {
    id: "step-3",
    runId: "run-1",
    messageId: "msg-1",
    label: "Execute Python (Retry)",
    summary: "Self-corrected trend calculation",
    status: "completed",
    startedAt: "2026-11-19T10:00:04Z",
    completedAt: "2026-11-19T10:00:05Z",
    durationMs: 180,
    code: "df['rev'] = df['TotalRevenue'].astype(float)",
    stdout: "Processed 1,250 rows successfully",
    outputs: [{ id: "art-1", name: "revenue_trend.png", resourceType: "artifact" }],
  },
];

describe("AgentTrace component", () => {
  it("renders execution trace header and step list", () => {
    render(<AgentTrace steps={mockSteps} />);
    expect(screen.getByText("Agent execution")).toBeVisible();
    expect(screen.getByText("Inspect Dataset")).toBeVisible();
    expect(screen.getByText("Execute Python")).toBeVisible();
    expect(screen.getByText("Execute Python (Retry)")).toBeVisible();
  });

  it("indicates hybrid recovery when a failed step is succeeded by subsequent steps", () => {
    render(<AgentTrace steps={mockSteps} />);
    // Step 2 failed but was recovered by step 3
    expect(screen.getByText("Recovered")).toBeVisible();
    expect(
      screen.getByText(/Self-correction succeeded: Error was automatically recovered in subsequent steps/i)
    ).toBeVisible();
  });

  it("renders and expands code, outputs, and invokes onResourceSelect on click", async () => {
    const user = userEvent.setup();
    const onResourceSelect = vi.fn();
    render(<AgentTrace steps={mockSteps} onResourceSelect={onResourceSelect} />);

    // Expand step 1
    await user.click(screen.getByRole("button", { name: /Inspect Dataset/i }));
    // Click input resource chip
    const inputChip = screen.getByRole("button", { name: "Select sales.csv" });
    expect(inputChip).toBeVisible();
    await user.click(inputChip);
    expect(onResourceSelect).toHaveBeenCalledWith("ds-1");

    // Expand step 3
    await user.click(screen.getByRole("button", { name: /Execute Python \(Retry\)/ }));
    // Click output resource chip
    const outputChip = screen.getByRole("button", { name: "Select revenue_trend.png" });
    expect(outputChip).toBeVisible();
    await user.click(outputChip);
    expect(onResourceSelect).toHaveBeenCalledWith("art-1");

    // Check code blocks
    expect(screen.getByText("df['rev'] = df['revenue'].astype(float)")).toBeVisible();
    expect(screen.getByText("Processed 1,250 rows successfully")).toBeVisible();
  });

  it("displays running status indicator when a step is currently running", () => {
    const runningSteps: TraceStep[] = [
      {
        id: "step-run",
        runId: "run-2",
        messageId: "msg-2",
        label: "Execute Python",
        summary: "Running analysis script...",
        status: "running",
        startedAt: "2026-11-19T10:00:00Z",
        code: "import pandas as pd",
      },
    ];
    render(<AgentTrace steps={runningSteps} />);
    expect(screen.getByText(/Running Execute Python/i)).toBeVisible();
  });
});
