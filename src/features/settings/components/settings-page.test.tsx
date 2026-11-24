import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./settings-page";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

describe("settings page", () => {
  it("opens profile settings and switches detail tabs", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: /Profile and preferences/ }));
    expect(screen.getByRole("heading", { name: "Identity details" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Authentication" }));
    expect(screen.getByRole("heading", { name: "Sign-in details" })).toBeVisible();
  });

  it("opens usage analytics with credits, disk space and compute time", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: /Usage analytics/ }));
    expect(screen.getByRole("heading", { name: "Usage analytics" })).toBeVisible();
    for (const label of ["AI credits", "Disk space", "Compute time"]) expect(await screen.findByRole("region", { name: label }, { timeout: 5000 })).toBeVisible();
  });

  it("opens the plan and returns to the overview", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: /Your plan/ }));
    expect(screen.getByRole("heading", { name: "Storage usage" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Settings overview" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});
