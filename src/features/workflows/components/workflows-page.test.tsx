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
  getWorkflowRunRecord: async () => api.run,
  runWorkflowNow: (id: string) => api.runNow(id),
  setWorkflowRecordState: (id: string, state: string) => api.setState(id, state),
  cancelWorkflowRunRecord: vi.fn(),
  getModels: async () => ({ models: [], default_model_id: "m" }),
}));

const wrap = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
const workflow = { id: "w1", name: "Daily revenue", description: "", prompt: "", state: "active", trigger: { kind: "schedule", config: { frequency: "daily", time: "09:00" } }, steps: [], schedule: "Every day at 9:00 AM", next_run_at: "2026-11-25T03:30:00Z", last_run_at: null, created_at: "", updated_at: "" };
const run = (extra = {}) => ({ id: "r1", workflow_id: "w1", workflow_name: "Daily revenue", trigger: "schedule", status: "success", error: "", started_at: "2026-11-24T03:30:00Z", finished_at: "2026-11-24T03:30:07Z", cancelled_at: null, results: [], ...extra });

describe("workflows page", () => {
  beforeEach(() => { vi.clearAllMocks(); api.workflows = [workflow]; api.runs = [run()]; });

  it("lists workflows with their schedule and last result, and offers templates", async () => {
    wrap(<WorkflowsPage />);
    const list = await screen.findByRole("list", { name: "Your workflows" });
    expect(within(list).getByText("Daily revenue")).toBeVisible();
    expect(within(list).getByText(/Every day at 9:00 AM/)).toBeVisible();
    expect(within(list).getByText("Done")).toBeVisible();
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

  it("shows every run in the history with its outcome", async () => {
    api.runs = [run(), run({ id: "r2", status: "failed", error: "Step 2 failed: boom" })];
    const user = userEvent.setup();
    wrap(<WorkflowsPage />);
    await user.click(await screen.findByRole("tab", { name: /History/ }));
    expect(await screen.findByText("Step 2 failed: boom")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});

describe("workflow run page", () => {
  it("shows each step's input and output side by side with its log", async () => {
    api.run = run({ results: [
      { step_id: "a", title: "Get data", kind: "data", status: "success", input: { dataset_ids: ["d"] }, output: { rows: 3 }, logs: ["Read 3 rows"], error: "", started_at: null, finished_at: null },
      { step_id: "b", title: "Summarise", kind: "ai", status: "running", input: null, output: null, logs: [], error: "", started_at: null, finished_at: null },
      { step_id: "c", title: "Send", kind: "notify", status: "pending", input: null, output: null, logs: [], error: "", started_at: null, finished_at: null },
    ], status: "running", finished_at: null });
    wrap(<WorkflowRunPage workflowId="w1" runId="r1" />);
    const first = await screen.findByRole("region", { name: "Step 1: Get data" });
    expect(within(first).getByText("Input")).toBeVisible();
    expect(within(first).getByText("Output")).toBeVisible();
    expect(within(first).getByText("Read 3 rows")).toBeVisible();
    const second = screen.getByRole("region", { name: "Step 2: Summarise" });
    expect(within(second).getByText("Working…")).toBeVisible();
    expect(within(second).getByText("Running")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Step 3: Send" })).queryByText("Input")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();
  });
});
