import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowsPage } from "./workflows-page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorkflowsPage /></QueryClientProvider>);
}

describe("workflows page", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it("lists seeded workflows and filters by status and search", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Weekly revenue report")).toBeVisible();
    expect(screen.getByText("Sales data refresh")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Inactive" }));
    expect(screen.getByText("Sales data refresh")).toBeVisible();
    expect(screen.queryByText("Weekly revenue report")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search workflows" }), "churn");
    expect(screen.getByText("Customer churn monitor")).toBeVisible();
    expect(screen.queryByText("Weekly revenue report")).not.toBeInTheDocument();
  });

  it("shows all runs on the Runs tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Weekly revenue report");
    await user.click(screen.getByRole("tab", { name: /Runs/ }));
    expect(screen.getAllByText("Weekly revenue report").length).toBeGreaterThan(0);
  });
});
