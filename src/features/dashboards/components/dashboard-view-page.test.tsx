import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardViewPage } from "./dashboard-view-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const { offline, rows } = vi.hoisted(() => {
  const rec = (id: string, name: string, extra: Record<string, unknown>) => ({
    id, name, description: "", status: "published", pinned: false, slicers: [], dataset_ids: [], widgets: [], owner: "You", ownership: "owned", role: "owner",
    refresh_minutes: 0, shares: [], created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", ...extra,
  });
  return {
    offline: async () => { throw new Error("offline"); },
    rows: [rec("customer-health", "Customer Health", { status: "draft" }), rec("sales-performance", "Sales Performance", { owner: "Alex", ownership: "shared", role: "viewer", shares: undefined })],
  };
});
vi.mock("@/lib/api", () => ({ ApiError: class extends Error { status = 404 }, listDashboardRecords: async () => rows, getDashboardRecord: async (id: string) => { const found = rows.find((row) => row.id === id); if (!found) throw Object.assign(new Error("missing"), { status: 404 }); return found; }, saveDashboardRecord: offline, deleteDashboardRecord: offline, getLibrary: async () => ({ items: [] }), getModels: async () => ({ default_model_id: "m", models: [], configuration_status: "ok" }), generateDashboardWithAi: vi.fn(), reviewDashboardWithAi: vi.fn(), tuneDashboardWithAi: vi.fn(), listDashboardPeople: async () => [{ id: "user-shared", name: "Shared Demo", initials: "SD" }], syncDatasetFromDrive: vi.fn(), getDatasetRows: vi.fn() }));

function renderPage(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardViewPage dashboardId={id} /></QueryClientProvider>);
}

describe("dashboard view page", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it("shows an owned dashboard with share, edit and AI controls, and enters edit mode", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    expect(await screen.findByRole("heading", { name: "Customer Health" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Share/ })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Ask AI to change this dashboard" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Dashboard name" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
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

  it("lets the owner open the share dialog", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    await user.click(await screen.findByRole("button", { name: /Share/ }));
    expect(await screen.findByRole("combobox", { name: "General access" })).toHaveValue("draft");
    expect(screen.getByRole("combobox", { name: "Add person" })).toBeVisible();
  });

  it("reports a missing dashboard", async () => {
    renderPage("nope");
    expect(await screen.findByText("Dashboard not found")).toBeVisible();
  });
});
