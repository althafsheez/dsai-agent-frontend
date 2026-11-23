import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardsPage } from "./dashboards-page";

describe("dashboards page", () => {
  it("renders preview dashboards as a card grid with pinned items first", () => {
    render(<DashboardsPage />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(9);
    expect(cards[0]).toHaveAccessibleName("Revenue Overview");
    expect(cards[1]).toHaveAccessibleName("Sales Performance");
    expect(screen.getByText("9 dashboards")).toBeVisible();
  });

  it("searches and filters the preview dashboards", async () => {
    const user = userEvent.setup();
    render(<DashboardsPage />);

    await user.click(screen.getByRole("button", { name: /^Owned/ }));
    expect(screen.queryByRole("article", { name: "Sales Performance" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Revenue Overview" })).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "customer");
    expect(screen.getByRole("article", { name: "Customer Health" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Revenue Overview" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("article", { name: "Revenue Overview" })).toBeVisible();
  });

  it("pins and unpins dashboards and filters by pinned", async () => {
    const user = userEvent.setup();
    render(<DashboardsPage />);

    await user.click(screen.getByRole("button", { name: "Pin Customer Health" }));
    expect(screen.getAllByRole("article").slice(0, 3).map((card) => card.getAttribute("aria-label"))).toEqual([
      "Revenue Overview",
      "Customer Health",
      "Sales Performance",
    ]);

    await user.click(screen.getByRole("button", { name: /^Pinned/ }));
    expect(screen.getAllByRole("article")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Unpin Customer Health" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("offers a way back from an empty result", async () => {
    const user = userEvent.setup();
    render(<DashboardsPage />);

    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "zzz");
    expect(screen.getByText("No matching dashboards")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(9);
  });
});
