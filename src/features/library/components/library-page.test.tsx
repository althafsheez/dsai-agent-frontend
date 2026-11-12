import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryPage } from "./library-page";

describe("library page", () => {
  it("searches, filters favorites, and opens the featured collection", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    expect(screen.getByText("Revenue Analysis.ipynb")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Search library" }), "cluster");
    expect(screen.getByText("Cluster Visualization")).toBeVisible();
    expect(screen.queryByText("Revenue Analysis.ipynb")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    await user.click(screen.getByRole("button", { name: "Show favorites only" }));
    expect(screen.getByText("Sales Analytics Dashboard")).toBeVisible();
    expect(screen.queryByText("Revenue Analysis.ipynb")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show favorites only" }));
    await user.click(screen.getByRole("button", { name: "View collection" }));
    expect(screen.getByRole("textbox", { name: "Search library" })).toHaveValue("revenue");
    expect(screen.getByText("Revenue Analysis.ipynb")).toBeVisible();
  });
});
