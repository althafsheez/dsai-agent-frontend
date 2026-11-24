import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardViewPage } from "./dashboard-view-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({
  default: () => function Stub({ widget, onOpen, handle }: { widget: { title: string }; onOpen?: () => void; handle?: object }) {
    return <article aria-label={widget.title}>{widget.title}{handle ? <span role="button" aria-label={`Move ${widget.title}`} /> : null}{onOpen ? <button type="button" aria-label={`Edit ${widget.title}`} onClick={onOpen}>Edit</button> : null}</article>;
  },
}));
vi.mock("@/features/connectors/components/drive-browser-dialog", () => ({ DriveBrowserDialog: () => null }));

const columns = [{ name: "region", data_type: "string" }, { name: "revenue", data_type: "string" }];
const sample = [["North", "10"], ["South", "20"]];
const { rows, reset, save, tables } = vi.hoisted(() => {
  const rec = (id: string, name: string, extra: Record<string, unknown>) => ({
    id, name, description: "", status: "published", pinned: false, slicers: [], dataset_ids: [], widgets: [], owner: "You", ownership: "owned", role: "owner",
    refresh_minutes: 0, shares: [], created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", ...extra,
  });
  const w = { id: "w1", type: "bar", title: "Revenue by region", dataset_id: "d1", x: "region", y: "revenue", agg: "sum", span: 2 };
  const fresh = (): Array<Record<string, unknown>> => [
    rec("customer-health", "Customer Health", { status: "draft", widgets: [w], dataset_ids: ["d1"] }),
    rec("empty-draft", "Empty Draft", { status: "draft" }),
    rec("live-one", "Live One", { status: "published", refresh_minutes: 15, widgets: [w], dataset_ids: ["d1"] }),
    rec("sales-performance", "Sales Performance", { owner: "Alex", ownership: "shared", role: "viewer", shares: undefined }),
  ];
  const all = fresh();
  return {
    rows: all, reset: () => all.splice(0, all.length, ...fresh()),
    save: vi.fn(async (input: Record<string, unknown>) => { const found = all.find((row) => row.id === input.id)!; Object.assign(found, input, { updated_at: new Date().toISOString() }); return found; }),
    tables: [{ dataset_id: "d1", dataset: "orders.csv", table: "orders", columns: ["region", "revenue"] }],
  };
});
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error { status = 404 },
  listDashboardRecords: async () => rows,
  getDashboardRecord: async (id: string) => { const found = rows.find((row) => row.id === id); if (!found) throw Object.assign(new Error("missing"), { status: 404 }); return found; },
  saveDashboardRecord: save, deleteDashboardRecord: vi.fn(),
  getLibrary: async () => ({ items: [{ id: "d1", name: "orders.csv", resource_type: "dataset", columns, preview_rows: sample, row_count: 2 }] }),
  getModels: async () => ({ default_model_id: "m", models: [], configuration_status: "ok" }),
  getDatasetRows: async () => ({ name: "orders.csv", columns, rows: sample, total_rows: 2, truncated: false }),
  generateDashboardWithAi: vi.fn(), reviewDashboardWithAi: vi.fn(), tuneDashboardWithAi: vi.fn(), buildCustomChartWithAi: vi.fn(), analyzeDatasets: vi.fn(), runCustomChart: vi.fn(),
  listDashboardPeople: async () => [{ id: "user-shared", name: "Shared Demo", initials: "SD" }], syncDatasetFromDrive: vi.fn(), uploadResource: vi.fn(),
  getSqlTables: async () => tables, runDashboardSql: vi.fn(),
}));

function renderPage(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardViewPage dashboardId={id} /></QueryClientProvider>);
}

describe("dashboard page", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } save.mockClear(); reset(); });

  it("opens a draft in the editor: datasets on the right with Ask AI below, Preview and Publish in the header", async () => {
    renderPage("customer-health");
    expect(await screen.findByRole("textbox", { name: "Dashboard name" })).toHaveValue("Customer Health");
    const tools = screen.getByRole("complementary", { name: "Dashboard tools" });
    expect(within(tools).getByRole("tab", { name: /Datasets/ })).toHaveAttribute("aria-selected", "true");
    expect(within(tools).getByRole("tab", { name: /Library/ })).toBeVisible();
    expect(await within(tools).findByText("orders.csv")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Ask AI to change this dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
  });

  it("previews without editing tools or refresh, and goes back to editing", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.getByText(/Preview: this is how/)).toHaveTextContent("does not refresh");
    expect(screen.queryByRole("complementary", { name: "Dashboard tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ask AI to change this dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh data/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Revenue by region")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(screen.getByRole("textbox", { name: "Dashboard name" })).toBeVisible();
  });

  it("publishes as live (no schedule) and then shows the clean live view", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await user.click(screen.getByRole("button", { name: "Publish dashboard" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "customer-health", status: "published", refresh_minutes: 1 }));
    expect(await screen.findByText(/Published · live/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Refresh data/ })).not.toBeInTheDocument();
    const tools = screen.getByRole("complementary", { name: "Dashboard tools" });
    expect(await within(tools).findByText("orders.csv")).toBeVisible();
    expect(within(tools).queryByRole("button", { name: "Edit dashboard" })).not.toBeInTheDocument();
    expect(within(tools).getByRole("button", { name: /Add dataset/ })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Ask AI to change this dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Dashboard status" })).toHaveTextContent("Published");
  });

  it("shows a published dashboard clean, with Edit to bring the tools back", async () => {
    const user = userEvent.setup();
    renderPage("live-one");
    expect(await screen.findByRole("heading", { name: "Live One" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Dashboard status" })).toHaveTextContent(/· live/);
    expect(screen.queryByRole("textbox", { name: "Ask AI to change this dashboard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const tools = screen.getByRole("complementary", { name: "Dashboard tools" });
    expect(await within(tools).findByRole("textbox", { name: "Ask AI to change this dashboard" })).toBeVisible();
    expect(within(tools).queryByRole("tab", { name: /Datasets/ })).not.toBeInTheDocument();
  });

  it("keeps tiles locked until Edit is pressed, then swaps the datasets panel for the edit panel", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    const edit = await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Move Revenue by region" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Revenue by region" })).not.toBeInTheDocument();
    await user.click(edit);
    const tools = screen.getByRole("complementary", { name: "Dashboard tools" });
    expect(await within(tools).findByRole("list", { name: "Starting prompts" })).toBeVisible();
    expect(within(tools).getByRole("textbox", { name: "Ask AI to change this dashboard" })).toBeVisible();
    expect(within(tools).queryByRole("tab", { name: /Datasets/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Move Revenue by region" })).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize Revenue by region" })).toBeVisible();
  });

  it("opens a widget to show its tables and query, and edits it as SQL", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Edit Revenue by region" }));
    const editor = await screen.findByRole("region", { name: "Edit widget" });
    expect(await within(editor).findByText("orders")).toBeVisible();
    expect(within(editor).getByRole("combobox", { name: "Category column" })).toHaveValue("region");
    await user.click(within(editor).getByRole("button", { name: "Edit as SQL" }));
    const sql = within(editor).getByRole("textbox", { name: "SQL query" });
    expect((sql as HTMLTextAreaElement).value).toContain('FROM "orders"');
    await user.clear(sql);
    await user.type(sql, "SELECT region AS name, SUM(revenue) AS value FROM orders GROUP BY region");
    await user.click(within(editor).getByRole("button", { name: "Run & apply" }));
    expect(screen.getByRole("button", { name: /Save draft/ })).toBeEnabled();
  });

  it("is read-only for viewers: no edit, share, delete or AI change box", async () => {
    renderPage("sales-performance");
    expect(await screen.findByRole("heading", { name: "Sales Performance" })).toBeVisible();
    expect(screen.getByText("View only")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Share/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Delete dashboard")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ask AI to change this dashboard" })).not.toBeInTheDocument();
  });

  it("lets the owner open the share dialog from the published view", async () => {
    const user = userEvent.setup();
    renderPage("live-one");
    await user.click(await screen.findByRole("button", { name: /Share/ }));
    expect(await screen.findByRole("combobox", { name: "General access" })).toHaveValue("published");
    expect(screen.getByRole("combobox", { name: "Add person" })).toBeVisible();
  });

  it("reports a missing dashboard", async () => {
    renderPage("nope");
    expect(await screen.findByText("Dashboard not found")).toBeVisible();
  });

  it("keeps Preview and Publish off an empty draft", async () => {
    renderPage("empty-draft");
    expect(await screen.findByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });
});
