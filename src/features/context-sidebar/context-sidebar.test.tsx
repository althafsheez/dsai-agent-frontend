import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextSidebar } from "./context-sidebar";
import { FilePreviewSidebar } from "./file-preview-sidebar";
import type { ArtifactResource, DatasetResource } from "./types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getModels: vi.fn(async () => ({ default_model_id: "gemini-test", models: [{ id: "gemini-test", label: "Gemini Test", supported_efforts: ["low"], default_effort: "low" }], configuration_status: "ready" })),
    getQuickAssistantMessages: vi.fn(async () => ({ items: [], next_cursor: null })),
    streamQuickAssistantMessage: vi.fn(async (_input, onEvent) => {
      onEvent({ event_id: "quick-created", run_id: "quick-answer", type: "message.created", data: { message_id: "quick-answer" }, timestamp: "2026-11-09T00:00:00Z", sequence: 1 });
      onEvent({ event_id: "quick-delta", run_id: "quick-answer", type: "message.delta", data: { message_id: "quick-answer", text: "A concise saved response." }, timestamp: "2026-11-09T00:00:00Z", sequence: 2 });
      onEvent({ event_id: "quick-completed", run_id: "quick-answer", type: "message.completed", data: { message_id: "quick-answer", content: "A concise saved response." }, timestamp: "2026-11-09T00:00:00Z", sequence: 3 });
    }),
  };
});

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
  afterEach(() => vi.unstubAllGlobals());

  it("switches tabs and groups resources by input and output", async () => {
    const user = userEvent.setup();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={vi.fn()} />);

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Datasets" })).getByText("Sales.csv")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Datasets" })).getByText("Revenue.xlsx")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    expect(screen.getByRole("tabpanel", { name: "Artifacts" })).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Artifacts" })).getByText("Revenue report.pdf")).toBeInTheDocument();
  });

  it("keeps input and output grouping for standalone chats", () => {
    render(<ContextSidebar {...baseProps} workspaceId={null} onClose={vi.fn()} onFileSelect={vi.fn()} />);
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("selects resources and requests adding an artifact to Library", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const onLibraryToggle = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={onFileSelect} onLibraryToggle={onLibraryToggle} />);

    await user.click(within(screen.getByRole("tabpanel", { name: "Datasets" })).getByText("Sales.csv"));
    expect(onFileSelect).toHaveBeenCalledWith(workspaceDataset);

    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    await user.click(screen.getByRole("button", { name: "Add Revenue report.pdf to Library" }));
    expect(onLibraryToggle).toHaveBeenCalledWith(artifact);
  });

  it("keeps Context mounted while an independent preview supports Back and Close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const previewDataset = { ...workspaceDataset, name: "Sales.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    render(<><ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={vi.fn()} /><FilePreviewSidebar file={previewDataset} onBack={onClose} onClose={onClose} /></>);
    expect(screen.getByRole("complementary", { name: "Analysis context" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Preview Sales.xlsx" })).toBeInTheDocument();
    expect(screen.getByText("2,500 rows · 3 columns")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("customer_id")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Return to context" }));
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers Copy when previewing a code resource", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("def total():\n    return 42\n")));
    const code: ArtifactResource = { ...artifact, id: "artifact-code", name: "total.py", kind: "code", preview_url: "/api/resources/artifact-code/preview" };
    render(<FilePreviewSidebar file={code} onBack={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Copy code" })).toBeVisible();
    expect(screen.getByText("return").closest("pre")).toHaveTextContent("return 42");
  });

  it("renders duplicate source column names without duplicate React keys", () => {
    const duplicateColumns: DatasetResource = {
      ...workspaceDataset,
      name: "Sales.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      columns: [
        { name: "sepal_length", data_type: "Float" },
        { name: "sepal_length", data_type: "Float" },
      ],
      preview_rows: [[5.1, 5.1]],
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<FilePreviewSidebar file={duplicateColumns} onBack={vi.fn()} onClose={vi.fn()} />);

    expect(within(screen.getByRole("table")).getAllByText("sepal_length")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("same key"));
    consoleError.mockRestore();
  });

  it("keeps the Quick Assistant separate from file selection and the main chat", () => {
    const onFileSelect = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={onFileSelect} />);

    expect(screen.getByRole("textbox", { name: "Ask Quick Assistant" })).toBeInTheDocument();
    expect(screen.getByText(/separate, saved chat/i)).toBeInTheDocument();
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it("closes context mode", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ContextSidebar {...baseProps} onClose={onClose} onFileSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Close context" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("filters datasets and artifacts in right sidebar using inline search bar", async () => {
    const user = userEvent.setup();
    render(<ContextSidebar {...baseProps} onClose={vi.fn()} onFileSelect={vi.fn()} />);

    const searchInput = screen.getByRole("searchbox", { name: "Search datasets and artifacts" });
    expect(searchInput).toBeInTheDocument();

    const datasetsPanel = screen.getByRole("tabpanel", { name: "Datasets" });
    // Both datasets visible initially in datasets panel
    expect(within(datasetsPanel).getByText("Sales.csv")).toBeInTheDocument();
    expect(within(datasetsPanel).getByText("Revenue.xlsx")).toBeInTheDocument();

    // Type "sales" to filter
    await user.type(searchInput, "sales");
    expect(within(datasetsPanel).getByText("Sales.csv")).toBeInTheDocument();
    expect(within(datasetsPanel).queryByText("Revenue.xlsx")).not.toBeInTheDocument();

    // Switch to Artifacts tab while search query is active
    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    const artifactsPanel = screen.getByRole("tabpanel", { name: "Artifacts" });
    expect(within(artifactsPanel).getByText(/No artifacts matching/i)).toBeInTheDocument();

    // Clear search using clear button
    const clearButton = screen.getByRole("button", { name: "Clear search" });
    await user.click(clearButton);
    expect(searchInput).toHaveValue("");
    expect(within(artifactsPanel).getByText("Revenue report.pdf")).toBeInTheDocument();
  });
});
