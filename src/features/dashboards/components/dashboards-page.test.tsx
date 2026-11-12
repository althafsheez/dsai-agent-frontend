import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardsPage } from "./dashboards-page";

describe("dashboards page", () => {
  it("searches and filters the preview dashboard table", async () => {
    const user = userEvent.setup();
    render(<DashboardsPage />);

    expect(screen.getByRole("row", { name: /Revenue Overview/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /Sales Performance/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Owned" }));
    expect(screen.queryByRole("row", { name: /Sales Performance/ })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "customer");
    expect(screen.getByRole("row", { name: /Customer Health/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /Revenue Overview/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("row", { name: /Revenue Overview/ })).toBeVisible();
  });
});
