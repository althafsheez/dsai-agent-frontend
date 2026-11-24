import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceDetailPage } from "./workspace-detail-page";

const workspaceData = {
  id: "ws-1",
  name: "Growth Ops",
  description: "Growth operations workspace",
  created_by: "user-you",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  archived_at: null,
  deleted_at: null,
};

const chatsData = [
  {
    id: "chat-1",
    title: "Q4 Funnel Analysis",
    created_at: "2026-11-11T10:00:00Z",
    updated_at: "2026-11-12T10:00:00Z",
    archived_at: null,
    deleted_at: null,
    created_by: "user-you",
    workspace_id: "ws-1",
  },
  {
    id: "chat-2",
    title: "CAC Payback Review",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    archived_at: null,
    deleted_at: null,
    created_by: "user-you",
    workspace_id: "ws-1",
  },
];

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getWorkspace: vi.fn(async () => workspaceData),
    getWorkspaceChats: vi.fn(async () => ({ items: chatsData })),
    getWorkspaceDatasets: vi.fn(async () => ({ items: [] })),
    getWorkspaceContextFiles: vi.fn(async () => ({ items: [] })),
    getWorkspaceWorkflows: vi.fn(async () => ({ items: [] })),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceDetailPage workspaceId="ws-1" />
    </QueryClientProvider>
  );
}

describe("WorkspaceDetailPage chats toolbar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses search, filters, and sorting for workspace chats", async () => {
    const user = userEvent.setup();
    renderPage();

    // Verify both chats are visible initially
    expect(await screen.findByText("Q4 Funnel Analysis")).toBeInTheDocument();
    expect(screen.getByText("CAC Payback Review")).toBeInTheDocument();

    // Use search input from HistoryToolbar
    const searchInput = screen.getByPlaceholderText("Search chats...");
    await user.type(searchInput, "funnel");

    expect(screen.getByText("Q4 Funnel Analysis")).toBeInTheDocument();
    expect(screen.queryByText("CAC Payback Review")).not.toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);
    expect(screen.getByText("CAC Payback Review")).toBeInTheDocument();
  });

  it("renders enlarged and polished dataset metadata when a dataset is selected", async () => {
    const { getWorkspaceDatasets } = await import("@/lib/api");
    vi.mocked(getWorkspaceDatasets).mockResolvedValueOnce({
      items: [
        {
          id: "ds-1",
          name: "sales_forecast.csv",
          mime_type: "text/csv",
          size_bytes: 2048576,
          origin: "uploaded",
          preview_url: null,
          download_url: "/api/datasets/ds-1/download",
          created_by: "user-you",
          created_at: "2026-11-10T10:00:00Z",
          row_count: 14500,
          column_count: 3,
          columns: [
            { name: "date", data_type: "VARCHAR" },
            { name: "region", data_type: "VARCHAR" },
            { name: "revenue", data_type: "FLOAT" },
          ],
          scope_type: "workspace",
          run_id: null,
        },
      ],
      next_cursor: null,
    });

    const user = userEvent.setup();
    renderPage();

    // Switch to Datasets tab
    const datasetsTab = await screen.findByRole("tab", { name: /Datasets/ });
    await user.click(datasetsTab);

    // Click on the dataset
    const datasetItem = await screen.findByRole("button", { name: /sales_forecast\.csv/ });
    await user.click(datasetItem);

    // Verify metadata area metrics
    expect(screen.getByText("14,500")).toBeInTheDocument();
    expect(screen.getByText("Schema Architecture")).toBeInTheDocument();
    expect(screen.getByText("3 fields")).toBeInTheDocument();
    expect(screen.getByText("date")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
    expect(screen.getByText("revenue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download dataset/ })).toHaveAttribute(
      "href",
      "/api/datasets/ds-1/download"
    );
  });
});
