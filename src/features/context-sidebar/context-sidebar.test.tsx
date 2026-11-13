import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextSidebar } from "./context-sidebar";
import { FilePreviewSidebar } from "./file-preview-sidebar";
import type { ArtifactResource, DatasetResource } from "./types";

const workspaceDataset: DatasetResource = {
  id: "dataset-workspace",
  name: "Sales.csv",
  mime_type: "text/csv",
  size_bytes: 24576,
  origin: "uploaded",
  preview_url: "/api/datasets/dataset-workspace/preview",
  download_url: "/api/datasets/dataset-workspace/download",
  created_by: "user-1",
  created_at: "2026-11-09T00:00:00Z",
  row_count: 2500,
  column_count: 3,
  columns: [
    { name: "customer_id", data_type: "Integer" },
    { name: "revenue", data_type: "Float" },
    { name: "date", data_type: "Date" },
  ],
  preview_rows: [[1, 1200, "2026-11-01"], [2, 1500, "2026-11-02"]],
  scope_type: "workspace",
  run_id: null,
};

const chatDataset: DatasetResource = {
  ...workspaceDataset,
  id: "dataset-chat",
  name: "Revenue.xlsx",
  mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  scope_type: "chat",
  row_count: 320,
};

const artifact: ArtifactResource = {
  id: "artifact-1",
  name: "Revenue report.pdf",
  mime_type: "application/pdf",
  size_bytes: 81920,
  origin: "generated",
  preview_url: "/api/artifacts/artifact-1/preview",
  download_url: "/api/artifacts/artifact-1/download",
  kind: "pdf",
  created_by: "user-1",
  created_at: "2026-11-09T00:00:00Z",
  run_id: "run-1",
  saved: false,
};

const baseProps = {
  chatId: "chat-1",
  workspaceId: "workspace-1",
  datasets: [workspaceDataset, chatDataset],
  artifacts: [artifact],
};

describe("ContextSidebar", () => {
  it("switches tabs and keeps datasets grouped by scope", async () => {
    const user = userEvent.setup();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={vi.fn()} />);

    expect(screen.getByText("Workspace Datasets")).toBeInTheDocument();
    expect(screen.getByText("Chat Datasets")).toBeInTheDocument();
    expect(screen.getByText("Sales.csv")).toBeInTheDocument();
    expect(screen.getByText("Revenue.xlsx")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    expect(screen.getByRole("tabpanel", { name: "Artifacts" })).toBeInTheDocument();
    expect(screen.getByText("Revenue report.pdf")).toBeInTheDocument();
  });

  it("omits the workspace group for standalone chats", () => {
    render(<ContextSidebar {...baseProps} workspaceId={null} onClose={vi.fn()} onFileSelect={vi.fn()} />);
    expect(screen.queryByText("Workspace Datasets")).not.toBeInTheDocument();
    expect(screen.getByText("Chat Datasets")).toBeInTheDocument();
  });

  it("selects resources and toggles artifact favorites locally", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={onFileSelect} />);

    await user.click(screen.getByText("Sales.csv"));
    expect(onFileSelect).toHaveBeenCalledWith(workspaceDataset);

    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    await user.click(screen.getByRole("button", { name: "Save Revenue report.pdf to Library" }));
    expect(screen.getByRole("button", { name: "Remove Revenue report.pdf from Library" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps Context mounted while an independent preview supports Back and Close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<><ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={vi.fn()} /><FilePreviewSidebar file={workspaceDataset} onBack={onClose} onClose={onClose} /></>);
    expect(screen.getByRole("complementary", { name: "Analysis context" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Preview Sales.csv" })).toBeInTheDocument();
    expect(screen.getByText("2,500 rows · 3 columns")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("customer_id")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Return to context" }));
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Quick Assistant messages independent from file selection and the main chat", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={onFileSelect} />);

    await user.type(screen.getByRole("textbox", { name: "Ask Quick Assistant" }), "What is in these files?");
    await user.click(screen.getByRole("button", { name: "Send to Quick Assistant" }));

    expect(screen.getByText("What is in these files?")).toBeInTheDocument();
    expect(screen.getByText(/read-only demo response/i)).toBeInTheDocument();
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it("closes context mode", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={onClose} onFileSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Close context" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
