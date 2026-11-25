import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowsPage } from "./workflows-page";
import { WorkflowRunPage } from "./workflow-run-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const api = vi.hoisted(() => ({ workflows: [] as unknown[], runs: [] as unknown[], run: null as unknown, runNow: vi.fn(), setState: vi.fn() }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {},
  listWorkflowRecords: async () => api.workflows,
  listWorkflowRunRecords: async () => api.runs,
  getWorkflowRunsPage: async (_id: string | undefined, offset: number, limit: number) => ({ items: [...api.runs].sort((a, b) => Date.parse((b as { started_at: string }).started_at) - Date.parse((a as { started_at: string }).started_at)).slice(offset, offset + limit), total: api.runs.length }),
  getWorkflowRunRecord: async () => api.run,
  runWorkflowNow: (id: string) => api.runNow(id),
  setWorkflowRecordState: (id: string, state: string) => api.setState(id, state),
  cancelWorkflowRunRecord: vi.fn(),
  getPostgresConnections: async () => ({ items: [{ id: "pg1", name: "Northwind Test" }] }),
  getLibrary: async () => ({ items: [{ id: "d", name: "sales.csv", resource_type: "dataset" }] }),
  getModels: async () => ({ models: [], default_model_id: "m" }),
}));

const wrap = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
const workflow = { id: "w1", name: "Daily revenue", description: "", prompt: "", state: "active", trigger: { kind: "schedule", config: { frequency: "daily", time: "09:00" } }, steps: [
  { id: "source", kind: "data", title: "Fetch sales", detail: "" },
  { id: "analysis", kind: "ai", title: "Summarize revenue", detail: "" },
  { id: "output", kind: "notify", title: "Save report", detail: "" },
], schedule: "Every day at 9:00 AM", next_run_at: "2026-11-25T03:30:00Z", last_run_at: null, created_at: "", updated_at: "" };
const run = (extra = {}) => ({ id: "r1", workflow_id: "w1", workflow_name: "Daily revenue", trigger: "schedule", status: "success", error: "", started_at: "2026-11-24T03:30:00Z", finished_at: "2026-11-24T03:30:07Z", cancelled_at: null, results: [], ...extra });

describe("workflows page", () => {
  beforeEach(() => { vi.clearAllMocks(); api.workflows = [workflow]; api.runs = [run()]; });

  it("shows saved workflow previews, trigger types, lifecycle and run results", async () => {
    api.workflows.push(
      { ...workflow, id: "w2", name: "Paused inventory", state: "inactive" },
      { ...workflow, id: "w3", name: "Draft report", state: "draft", trigger: { kind: "manual", config: { show_on_canvas: false } }, steps: [] },
    );
    wrap(<WorkflowsPage />);
    const list = await screen.findByRole("list", { name: "Saved workflows" });
    expect(within(list).getByRole("link", { name: "Daily revenue" })).toHaveAttribute("href", "/workflows/w1");
    expect(within(list).getByText("Active")).toBeVisible();
    expect(within(list).getByText("Paused")).toBeVisible();
    expect(within(list).getByText("Draft")).toBeVisible();
    expect(within(list).getByText("Manual trigger")).toBeVisible();
    expect(within(list).getByText("No steps yet")).toBeVisible();
    expect(within(list).getAllByRole("switch")).toHaveLength(2);
    expect(within(list).getAllByText("Scheduled · Every day at 9:00 AM")).toHaveLength(2);
    const previews = within(list).getAllByRole("list", { name: "Workflow preview" });
    expect(within(previews[0]).getByText("Fetch sales")).toBeVisible();
    expect(within(previews[0]).getByText("Summarize revenue")).toBeVisible();
    expect(within(previews[0]).getByRole("listitem", { name: "1 more step" })).toHaveTextContent("+1");
    expect(await within(list).findByRole("link", { name: "Last run Done" })).toHaveAttribute("href", "/workflows/w1/runs/r1");
  });

  it("keeps templates available in their own tab", async () => {
    const user = userEvent.setup();
    wrap(<WorkflowsPage />);
    expect(screen.queryByRole("list", { name: "Workflow templates" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Templates" }));
    expect(screen.getByRole("list", { name: "Workflow templates" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Use the Daily sales summary template" })).toHaveAttribute("href", "/workflows/new?template=daily-sales-summary");
  });

  it("turns a workflow off and runs it by hand", async () => {
    api.setState.mockResolvedValue(workflow);
    api.runNow.mockResolvedValue(run({ status: "running" }));
    const user = userEvent.setup();
    wrap(<WorkflowsPage />);
    await user.click(await screen.findByRole("switch", { name: "Turn off Daily revenue" }));
    expect(api.setState).toHaveBeenCalledWith("w1", "inactive");
    await user.click(screen.getByRole("button", { name: "Run Daily revenue now" }));
    expect(api.runNow).toHaveBeenCalledWith("w1");
  });

  it("lists runs from different workflows together, newest first", async () => {
    api.workflows = [workflow, { ...workflow, id: "w2", name: "Weekly inventory" }, { ...workflow, id: "w3", name: "Unused workflow" }];
    api.runs = [
      run(),
      run({ id: "r2", workflow_id: "w2", workflow_name: "Weekly inventory", started_at: "2026-11-24T03:29:58Z" }),
      run({ id: "r3", workflow_name: "Old revenue name", status: "failed", error: "Step 2 failed: boom", started_at: "2026-11-24T03:30:02Z" }),
    ];
    const user = userEvent.setup();
    wrap(<WorkflowsPage />);
    await screen.findByRole("tab", { name: "Workflows (3)" });
    await user.click(screen.getByRole("tab", { name: "Runs" }));
    const table = await screen.findByRole("table", { name: "Runs" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("columnheader", { name: "Workflow" })).toBeVisible();
    expect(within(table).getByText("Step 2 failed: boom")).toBeVisible();
    expect(within(table).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/workflows/w1/runs/r3",
      "/workflows/w1/runs/r1",
      "/workflows/w2/runs/r2",
    ]);
    expect(within(table).getAllByRole("link", { name: /Daily revenue/ })).toHaveLength(2);
    expect(within(table).getByRole("link", { name: /Weekly inventory/ })).toBeVisible();
    expect(within(table).queryByText("Unused workflow")).not.toBeInTheDocument();
  });
  it("paginates the combined runs list", async () => {
    api.runs = Array.from({ length: 14 }, (_, index) => run({ id: `r${index}`, started_at: new Date(Date.UTC(2026, 10, 24, 3, index)).toISOString() }));
    const user = userEvent.setup();
    wrap(<WorkflowsPage />);
    await user.click(await screen.findByRole("tab", { name: "Runs" }));
    expect(await screen.findByText("Page 1 of 2 · 14 runs")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Runs" })).getAllByRole("row")).toHaveLength(13);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2 · 14 runs")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Runs" })).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

});

describe("workflow run page", () => {
  it("shows each step's input and output side by side with its log", async () => {
    api.run = run({ results: [
      { step_id: "a", title: "Get data", kind: "data", status: "success", input: { connection_id: "pg1", sql: "SELECT * FROM products" }, output: { rows: 3 }, logs: ["Read 3 rows"], error: "", started_at: null, finished_at: null },
      { step_id: "b", title: "Summarise", kind: "ai", status: "running", input: null, output: null, logs: [], error: "", started_at: null, finished_at: null },
      { step_id: "c", title: "Send", kind: "notify", status: "pending", input: null, output: null, logs: [], error: "", started_at: null, finished_at: null },
    ], status: "running", finished_at: null });
    wrap(<WorkflowRunPage workflowId="w1" runId="r1" />);
    const first = await screen.findByRole("region", { name: "Step 1: Get data" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(first).getByText("SQL query")).toBeVisible();
    expect(within(first).getByText("SELECT * FROM products")).toBeVisible();
    expect(within(first).queryByText("Input")).not.toBeInTheDocument();
    expect(within(first).queryByText("Output")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Northwind Test" })).toBeVisible();
    expect(within(first).getByText("Read 3 rows")).toBeVisible();
    const second = screen.getByRole("region", { name: "Step 2: Summarise" });
    expect(within(second).queryByText("Input")).not.toBeInTheDocument();
    expect(within(second).getByText("Running")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Step 3: Send" })).queryByText("Input")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();
  });
  it("collapses step details and shows recorded files and run information", async () => {
    const user = userEvent.setup();
    api.run = run({ results: [{ step_id: "a", title: "Analyze", kind: "ai", status: "success", input: { model: "gemini-test" }, output: { text: "Result", resources: [{ id: "file-1", name: "report.pdf" }] }, logs: ["Finished"], error: "", started_at: null, finished_at: null }] });
    wrap(<WorkflowRunPage workflowId="w1" runId="r1" />);
    const step = await screen.findByRole("region", { name: "Step 1: Analyze" });
    expect(within(step).queryByText("Finished")).not.toBeInTheDocument();
    await user.click(within(step).getByRole("button"));
    expect(within(step).getByText("Finished")).toBeVisible();
    const info = screen.getByRole("complementary", { name: "Run information" });
    expect(within(info).getByText("Model: gemini-test")).toBeVisible();
    expect(within(info).getByRole("button", { name: "Download report.pdf" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(step).queryByText("Finished")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide run details" }));
    expect(screen.queryByRole("complementary", { name: "Run information" })).not.toBeInTheDocument();
  });

});
