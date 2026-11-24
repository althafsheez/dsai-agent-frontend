import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardBuilderPage } from "./dashboard-builder-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/dynamic", () => ({ default: () => function Stub({ widget }: { widget: { title: string } }) { return <article aria-label={widget.title}>{widget.title}</article>; } }));

const columns = [{ name: "region", data_type: "string" }, { name: "revenue", data_type: "string" }];
const rows = [["North", "10"], ["South", "20"]];
const { generate, tune, custom, analyze, saveRecord } = vi.hoisted(() => ({ generate: vi.fn(), tune: vi.fn(), custom: vi.fn(), analyze: vi.fn(), saveRecord: vi.fn() }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error { status = 0 },
  getLibrary: async () => ({ items: [{ id: "d1", name: "sales.csv", resource_type: "dataset", columns, preview_rows: rows, row_count: 2 }] }),
  getModels: async () => ({ default_model_id: "m", models: [], configuration_status: "ok" }),
  getDatasetRows: async () => ({ name: "sales.csv", columns, rows, total_rows: 2, truncated: false }),
  generateDashboardWithAi: generate, tuneDashboardWithAi: tune, reviewDashboardWithAi: vi.fn(), buildCustomChartWithAi: custom, analyzeDatasets: analyze,
  saveDashboardRecord: saveRecord, getDashboardRecord: async () => { throw new Error("none"); }, listDashboardRecords: async () => [],
  uploadResource: vi.fn(), listDashboardPeople: async () => [], syncDatasetFromDrive: vi.fn(),
}));
vi.mock("@/features/connectors/components/drive-browser-dialog", () => ({ DriveBrowserDialog: () => null }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardBuilderPage /></QueryClientProvider>);
}

describe("dashboard builder", () => {
  it("builds from a prompt, shows the AI's charts and saves them", async () => {
    generate.mockResolvedValue({ ok: true, name: "Sales", description: "", notes: ["Added a KPI."], slicers: ["region"], suggestions: ["Add a table"],
      widgets: [{ id: "w1", type: "kpi", title: "Total revenue", dataset_id: "d1", x: null, y: "revenue", agg: "sum", span: 1 }] });
    saveRecord.mockResolvedValue({ id: "db-1", name: "Sales", description: "", status: "draft", pinned: false, slicers: ["region"], dataset_ids: ["d1"], widgets: [], owner: "You", ownership: "owned", created_at: "", updated_at: "", role: "owner", refresh_minutes: 0 });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("sales.csv")).toBeVisible();
    expect(screen.getByRole("button", { name: /Save dashboard/ })).toBeDisabled();

    const box = screen.getByRole("textbox", { name: "Describe the dashboard" });
    await user.type(box, "Show revenue{Enter}");
    expect(await screen.findByLabelText("Total revenue")).toBeVisible();
    expect(screen.getByText("Added a KPI.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Dashboard name" })).toHaveValue("Sales");
    expect(screen.getByRole("textbox", { name: "Ask AI to change this dashboard" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Save dashboard/ }));
    expect(saveRecord).toHaveBeenCalledWith(expect.objectContaining({ name: "Sales", slicers: ["region"], dataset_ids: ["d1"] }));
  });

  it("hands a manually composed tile to the AI, which builds it", async () => {
    tune.mockReset();
    generate.mockResolvedValue({ ok: true, name: "Sales", description: "", notes: [], slicers: [], suggestions: [],
      widgets: [{ id: "w1", type: "bar", title: "Revenue by region", dataset_id: "d1", x: "region", y: "revenue", agg: "sum", span: 2 }] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox"));
    expect(screen.getByLabelText("What a Bar needs")).toHaveTextContent("A category column to group by");
    expect(screen.getByRole("button", { name: "Build with AI" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Category column" }), "region");
    await user.selectOptions(screen.getByRole("combobox", { name: "Number column" }), "revenue");
    await user.click(screen.getByRole("button", { name: "Build with AI" }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('Add a Bar tile from the dataset "sales.csv": the sum of "revenue" grouped by "region".') }));
    expect(await screen.findByLabelText("Revenue by region")).toBeVisible();
  });

  it("asks the AI to write a Python script for a tile no preset covers", async () => {
    custom.mockResolvedValue({ widget: { id: "w-py", type: "custom", title: "Top region share", dataset_id: "d1", datasets: ["d1"], agg: "count", span: 2, script: "result = {}", request: "share of the top region" }, result: { kind: "kpi", value: 66 } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Anything else (Python)" }));
    await user.type(screen.getByRole("textbox", { name: "Describe the tile" }), "share of the top region");
    await user.click(screen.getByRole("button", { name: "Build with AI" }));
    expect(custom).toHaveBeenCalledWith(expect.objectContaining({ request: "share of the top region", datasetIds: ["d1"] }));
    expect(await screen.findByLabelText("Top region share")).toBeVisible();
  });
});
