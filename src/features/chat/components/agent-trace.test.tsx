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
  it("shows the latest thought in the header and toggles the timeline", async () => {
    const user = userEvent.setup();
    render(<AgentTrace steps={mockSteps} isStreaming={false} />);

    expect(screen.getByText("Reasoning Trace")).toBeVisible();
    expect(screen.getByText("Self-corrected trend calculation")).toBeVisible();
    expect(screen.queryByText("Load schema for sales.csv")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle Reasoning Trace" }));
    expect(screen.getByText("Load schema for sales.csv")).toBeVisible();
    expect(screen.getByRole("button", { name: "Expand Initial trend calculation attempt python block" })).toBeVisible();
  });

  it("opens while streaming and shows the reasoning ellipsis", () => {
    render(<AgentTrace steps={mockSteps} isStreaming={true} />);

    expect(screen.getByRole("status", { name: "Reasoning in progress" })).toBeInTheDocument();
    expect(screen.getByText("Load schema for sales.csv")).toBeVisible();
  });

  it("says code is executing while a code step is running", () => {
    const running: TraceStep[] = [{ ...mockSteps[2], status: "running", stdout: undefined }];
    render(<AgentTrace steps={running} isStreaming={true} />);
    expect(screen.getByText("Executing code...")).toBeVisible();
  });

  it("keeps code collapsed until expanded and shows its output", async () => {
    const user = userEvent.setup();
    render(<AgentTrace steps={mockSteps} isStreaming={true} />);

    expect(screen.queryByText("Processed 1,250 rows successfully")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Self-corrected trend calculation python block" }));
    expect(screen.getByText("Processed 1,250 rows successfully")).toBeVisible();
    expect(screen.getByText("Output (success)")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Expand Initial trend calculation attempt python block" }));
    expect(screen.getByText("Output (failed)")).toBeVisible();
    expect(screen.getByText("KeyError: 'revenue'")).toBeVisible();
  });

  it("selects generated resources", async () => {
    const user = userEvent.setup();
    const onResourceSelect = vi.fn();
    render(<AgentTrace steps={mockSteps} isStreaming={true} onResourceSelect={onResourceSelect} />);

    await user.click(screen.getByRole("button", { name: "Select revenue_trend.png" }));
    expect(onResourceSelect).toHaveBeenCalledWith("art-1");
  });

  it("shows an error for a failed step without code", async () => {
    const failed: TraceStep[] = [{ ...mockSteps[0], status: "failed", error: "Dataset could not be read" }];
    render(<AgentTrace steps={failed} isStreaming={true} />);
    expect(screen.getByText("Dataset could not be read")).toBeVisible();
  });

  it("truncates long thought text at 250 characters and expands on toggle", async () => {
    const user = userEvent.setup();
    const longText =
      "This is a comprehensive analytical reasoning step where we thoroughly inspect the table columns, analyze data types, compute distribution percentiles, calculate the correlation matrix across continuous features, and verify data consistency before building our predictive model.";

    render(<IndividualThoughtTextRenderer text={longText} isStreaming={false} />);

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeVisible();
  });

  it("opens when a data reference asks to scroll to its table", async () => {
    render(<AgentTrace steps={mockSteps} isStreaming={false} />);
    expect(screen.queryByText("Load schema for sales.csv")).not.toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("expand-and-scroll-to-table", { detail: { tableName: "sales.csv" } }));

    expect(await screen.findByText("Load schema for sales.csv")).toBeVisible();
  });
});
