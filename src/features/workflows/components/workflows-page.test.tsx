import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowsPage } from "./workflows-page";

describe("workflows page", () => {
  it("searches and filters workflow previews", async () => {
    const user = userEvent.setup();
    render(<WorkflowsPage />);

    expect(screen.getByRole("heading", { name: "Weekly Revenue Report" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Executive Summary (Monthly)" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Inactive" }));
    expect(screen.getByRole("heading", { name: "Executive Summary (Monthly)" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Weekly Revenue Report" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search workflows" }), "snowflake");
    expect(screen.getByRole("heading", { name: "Customer Churn Monitor" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Weekly Revenue Report" })).not.toBeInTheDocument();
  });

  it("switches between grid and list previews", async () => {
    const user = userEvent.setup();
    render(<WorkflowsPage />);
    const listButton = screen.getByRole("button", { name: "List view" });
    expect(listButton).toHaveAttribute("aria-pressed", "false");
    await user.click(listButton);
    expect(listButton).toHaveAttribute("aria-pressed", "true");
  });
});
