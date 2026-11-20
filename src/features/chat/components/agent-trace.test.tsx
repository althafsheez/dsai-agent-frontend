import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTrace, IndividualThoughtTextRenderer } from "./agent-trace";
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

describe("AgentTrace component (Reasoning Trace)", () => {
  it("renders reasoning trace header with summary and toggles open/close", async () => {
    const user = userEvent.setup();
    render(<AgentTrace steps={mockSteps} isStreaming={false} />);

    expect(screen.getByText("Reasoning Trace")).toBeVisible();
    expect(screen.getByText("Execute Python (Retry)")).toBeVisible();

    // Toggle open
    const toggleButton = screen.getByRole("button", { name: "Toggle Reasoning Trace" });
    await user.click(toggleButton);

    expect(screen.getByText("Inspect Dataset")).toBeVisible();
    expect(screen.getByText("Execute Python")).toBeVisible();
  });

  it("auto-expands during streaming and shows pulsing ellipsis", () => {
    render(<AgentTrace steps={mockSteps} isStreaming={true} />);

    expect(screen.getByRole("status", { name: "Reasoning in progress" })).toBeInTheDocument();
    // Timeline is open by default while streaming
    expect(screen.getByText("Inspect Dataset")).toBeVisible();
  });

  it("indicates hybrid recovery when a failed step was self-corrected", async () => {
    render(<AgentTrace steps={mockSteps} isStreaming={true} />);

    // Step 2 failed but was recovered by step 3
    expect(screen.getByText("Recovered")).toBeVisible();
    expect(screen.getByText(/Self-corrected:/i)).toBeVisible();
  });

  it("expands code and allows resource chip clicking", async () => {
    const user = userEvent.setup();
    const onResourceSelect = vi.fn();

    render(<AgentTrace steps={mockSteps} isStreaming={true} onResourceSelect={onResourceSelect} />);

    // Expand step 1
    await user.click(screen.getByRole("button", { name: /Inspect Dataset/i }));
    const inputChip = screen.getByRole("button", { name: "Select sales.csv" });
    expect(inputChip).toBeVisible();
    await user.click(inputChip);
    expect(onResourceSelect).toHaveBeenCalledWith("ds-1");

    // Expand step 3
    await user.click(screen.getByRole("button", { name: /Execute Python \(Retry\)/ }));
    const outputChip = screen.getByRole("button", { name: "Select revenue_trend.png" });
    expect(outputChip).toBeVisible();
    await user.click(outputChip);
    expect(onResourceSelect).toHaveBeenCalledWith("art-1");

    // Check code and output
    expect(screen.getByText("df['rev'] = df['TotalRevenue'].astype(float)")).toBeVisible();
    expect(screen.getByText("Processed 1,250 rows successfully")).toBeVisible();
  });

  it("truncates long thought text at 250 characters and expands on toggle", async () => {
    const user = userEvent.setup();
    const longText =
      "This is a comprehensive analytical reasoning step where we thoroughly inspect the table columns, analyze data types, compute distribution percentiles, calculate the correlation matrix across continuous features, and verify data consistency before building our predictive model.";

    render(<IndividualThoughtTextRenderer text={longText} isStreaming={false} />);

    // Show more button present
    const showMoreButton = screen.getByRole("button", { name: "Show more" });
    expect(showMoreButton).toBeVisible();

    await user.click(showMoreButton);
    expect(screen.getByRole("button", { name: "Show less" })).toBeVisible();
  });

  it("auto-expands on expand-and-scroll-to-table custom event", async () => {
    render(<AgentTrace steps={mockSteps} isStreaming={false} />);

    // Initially collapsed
    expect(screen.queryByText("Inspect Dataset")).not.toBeInTheDocument();

    // Dispatch deep-link scroll event
    window.dispatchEvent(
      new CustomEvent("expand-and-scroll-to-table", {
        detail: { tableName: "sales.csv" },
      })
    );

    // Now expanded
    expect(await screen.findByText("Inspect Dataset")).toBeVisible();
  });
});
