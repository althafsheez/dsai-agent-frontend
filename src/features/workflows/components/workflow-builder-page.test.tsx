import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowBuilderPage } from "./workflow-builder-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ getLibrary: async () => ({ items: [{ id: "d1", name: "orders.csv", resource_type: "dataset" }] }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorkflowBuilderPage /></QueryClientProvider>);
}

describe("workflow builder canvas", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it("adds steps with the + button, flags incomplete ones and gates the On switch", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("switch", { name: "Workflow enabled" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add step at position 1" }));
    await user.click(screen.getByRole("menuitem", { name: "Send notification" }));
    expect(screen.getByRole("status")).toHaveTextContent("Add a recipient");
    expect(screen.getByRole("switch", { name: "Workflow enabled" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Recipient" }), "team@example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Workflow enabled" })).toBeEnabled();
    expect(screen.getByText("Email · team@example.com")).toBeVisible();
  });

  it("configures a weekly schedule trigger and runs a simulated test", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByRole("combobox", { name: "Trigger type" }), "schedule");
    await user.selectOptions(screen.getByRole("combobox", { name: "Frequency" }), "weekly");
    await user.selectOptions(screen.getByRole("combobox", { name: "Day" }), "Friday");
    expect(screen.getByText("Every Friday at 9:00 AM", { selector: "span" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add step at position 1" }));
    await user.click(screen.getByRole("menuitem", { name: "Build charts" }));
    await user.click(screen.getByRole("button", { name: "Test workflow" }));
    expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent("Rendered 4 charts");
  });
});
