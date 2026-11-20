import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardsPage } from "./dashboards-page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardsPage /></QueryClientProvider>);
}

describe("dashboards page", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it("searches and filters dashboards", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("link", { name: "Open Revenue Overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Sales Performance" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Owned" }));
    expect(screen.queryByRole("link", { name: "Open Sales Performance" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "customer");
    expect(screen.getByRole("link", { name: "Open Customer Health" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open Revenue Overview" })).not.toBeInTheDocument();
  });

  it("switches between grid and list", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Open Revenue Overview" });
    const list = screen.getByRole("button", { name: "List view" });
    await user.click(list);
    expect(list).toHaveAttribute("aria-pressed", "true");
  });
});
