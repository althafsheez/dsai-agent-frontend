import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardViewPage } from "./dashboard-view-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ getLibrary: async () => ({ items: [] }) }));

function renderPage(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardViewPage dashboardId={id} /></QueryClientProvider>);
}

describe("dashboard view page", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it("shows an owned dashboard with edit and publish controls, and enters edit mode", async () => {
    const user = userEvent.setup();
    renderPage("customer-health");
    expect(await screen.findByRole("heading", { name: "Customer Health" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Dashboard name" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
  });

  it("hides edit controls on shared dashboards", async () => {
    renderPage("sales-performance");
    expect(await screen.findByRole("heading", { name: "Sales Performance" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("reports a missing dashboard", async () => {
    renderPage("nope");
    expect(await screen.findByText("Dashboard not found")).toBeVisible();
  });
});
