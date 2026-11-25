import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowOverviewPage } from "./workflow-overview-page";

const { deleteWorkflow } = vi.hoisted(() => ({ deleteWorkflow: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth", () => ({ useAuth: () => ({ user: { name: "Demo user" } }) }));
vi.mock("@/lib/api", () => ({
  getWorkflowRecord: async () => ({ id: "w1", name: "Sales report", description: "Daily sales", state: "active", trigger: { kind: "schedule", config: { frequency: "daily" } }, steps: [{ id: "s1", kind: "data", title: "Read sales", detail: "Fetch data", config: { dataset_ids: ["d1"], connection_id: "pg1", connection_name: "Northwind", connection_provider: "postgresql" } }], schedule: "Every day at 9:00 AM", next_run_at: null, last_run_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" }),
  listWorkflowRunRecords: async () => [{ id: "r1", workflow_id: "w1", workflow_name: "Sales report", status: "running", trigger: "schedule", started_at: "2026-11-25T00:00:00Z", finished_at: null, results: [], error: "" }],
  getPostgresConnections: async () => ({ items: [] }),
  getWorkflowRunsPage: async (_id: string, offset: number) => ({ items: [{ id: offset ? "r2" : "r1", workflow_id: "w1", workflow_name: "Sales report", status: "running", trigger: "schedule", started_at: "2026-11-25T00:00:00Z", finished_at: null, results: [], error: "" }], total: 12 }),
  getLibrary: async () => ({ items: [{ id: "d1", name: "sales.csv", resource_type: "dataset" }] }),
  runWorkflowNow: vi.fn(), setWorkflowRecordState: vi.fn(), deleteWorkflowRecord: deleteWorkflow,
}));

describe("workflow overview", () => {
  it("keeps workflow details visible when switching to runs", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkflowOverviewPage workflowId="w1" /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Sales report" })).toBeVisible();
    const details = screen.getByRole("complementary", { name: "Workflow details" });
    expect(await within(details).findByText("sales.csv")).toBeVisible();
    expect(within(details).getByRole("link", { name: "Northwind" })).toHaveAttribute("href", "/extensions");
    expect(within(details).queryByRole("link", { name: "Open Library" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Edit" }).every((link) => link.getAttribute("href") === "/workflows/w1/edit")).toBe(true);
    expect(screen.getByRole("tab", { name: /Versions/ })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: /Runs/ }));
    expect(await screen.findByRole("table", { name: "Runs" })).toBeVisible();
    expect(within(details).getByText("sales.csv")).toBeVisible();
    expect(screen.getByText("Page 1 of 2 · 12 runs")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2 · 12 runs")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(within(details).getByRole("link", { name: /View run details/ })).toHaveAttribute("href", "/workflows/w1/runs/r1");
  });
  it("requires DELETE before deleting a workflow", async () => {
    const user = userEvent.setup();
    deleteWorkflow.mockResolvedValue(undefined);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkflowOverviewPage workflowId="w1" /></QueryClientProvider>);
    await user.click(await screen.findByRole("button", { name: "Delete workflow" }));
    const dialog = screen.getByRole("dialog", { name: "Delete workflow" });
    const confirm = within(dialog).getByRole("button", { name: "Delete workflow" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type DELETE"), "delete");
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Type DELETE"));
    await user.type(within(dialog).getByLabelText("Type DELETE"), "DELETE");
    await user.click(confirm);
    expect(deleteWorkflow.mock.calls[0][0]).toBe("w1");
  });

});
