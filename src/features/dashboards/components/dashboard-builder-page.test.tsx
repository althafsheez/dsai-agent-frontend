import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardBuilderPage } from "./dashboard-builder-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/connectors/components/drive-browser-dialog", () => ({ DriveBrowserDialog: () => null }));

const columns = [{ name: "region", data_type: "string" }, { name: "revenue", data_type: "string" }];
const rows = [["North", "10"], ["South", "20"]];
const { generate, analyze, saveRecord } = vi.hoisted(() => ({ generate: vi.fn(), analyze: vi.fn(), saveRecord: vi.fn() }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error { status = 0 },
  getLibrary: async () => ({ items: [{ id: "d1", name: "sales.csv", resource_type: "dataset", columns, preview_rows: rows, row_count: 2 }] }),
  getModels: async () => ({ default_model_id: "m", models: [], configuration_status: "ok" }),
  getDatasetRows: async () => ({ name: "sales.csv", columns, rows, total_rows: 2, truncated: false }),
  generateDashboardWithAi: generate, tuneDashboardWithAi: vi.fn(), reviewDashboardWithAi: vi.fn(), buildCustomChartWithAi: vi.fn(), analyzeDatasets: analyze,
  saveDashboardRecord: saveRecord, getDashboardRecord: async () => { throw new Error("none"); }, listDashboardRecords: async () => [],
  uploadResource: vi.fn(), listDashboardPeople: async () => [], syncDatasetFromDrive: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardBuilderPage /></QueryClientProvider>);
}

describe("new dashboard", () => {
  beforeEach(() => { push.mockClear(); generate.mockReset(); saveRecord.mockReset(); });

  it("asks for a name, the data files and the AI overview, then builds a draft and opens it", async () => {
    generate.mockResolvedValue({ ok: true, name: "Sales", description: "", notes: [], slicers: ["region"], suggestions: [],
      widgets: [{ id: "w1", type: "kpi", title: "Total revenue", dataset_id: "d1", x: null, y: "revenue", agg: "sum", span: 1 }] });
    saveRecord.mockResolvedValue({ id: "db-1", name: "Sales", description: "", status: "draft", pinned: false, slicers: [], dataset_ids: ["d1"], widgets: [], owner: "You", ownership: "owned", created_at: "", updated_at: "" });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("sales.csv")).toBeVisible();
    const create = screen.getByRole("button", { name: "Create Dashboard" });
    expect(create).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Revenue by region"), "Sales");
    await user.click(screen.getByRole("checkbox"));
    expect(create).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "AI Overview" }), "Show revenue by region");
    expect(create).toBeEnabled();
    await user.click(create);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Show revenue by region" }));
    expect(saveRecord).toHaveBeenCalledWith(expect.objectContaining({ name: "Sales", description: "Show revenue by region", dataset_ids: ["d1"], slicers: ["region"] }));
    expect(push).toHaveBeenCalledWith("/dashboards/db-1");
  });

  it("shows why it failed and stays on the form", async () => {
    generate.mockRejectedValue(new Error("The AI could not build a dashboard: Service unavailable"));
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByPlaceholderText("e.g. Revenue by region"), "Sales");
    await user.click(await screen.findByRole("checkbox"));
    await user.type(screen.getByRole("textbox", { name: "AI Overview" }), "Anything");
    await user.click(screen.getByRole("button", { name: "Create Dashboard" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
    expect(saveRecord).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
