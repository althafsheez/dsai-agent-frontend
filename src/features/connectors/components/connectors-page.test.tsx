import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectorsPage } from "./connectors-page";

describe("connectors page", () => {
  it("searches, filters categories, and explains unavailable installation", async () => {
    const user = userEvent.setup();
    render(<ConnectorsPage />);

    expect(screen.getByText("Snowflake")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByText("Data Cleaning")).toBeVisible();
    expect(screen.queryByText("Snowflake")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search connectors" }), "postgres");
    expect(screen.getByText("PostgreSQL")).toBeVisible();
    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add", expanded: false }));
    expect(screen.getByRole("status")).toHaveTextContent(/coming soon/i);
  });

  it("connects and disconnects a connector (demo state)", async () => {
    const user = userEvent.setup();
    render(<ConnectorsPage />);
    await user.click(screen.getByRole("button", { name: "Connect Snowflake" }));
    expect(screen.getByRole("button", { name: "Disconnect Snowflake" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Disconnect Snowflake" }));
    expect(screen.getByRole("button", { name: "Connect Snowflake" })).toBeVisible();
  });
});
