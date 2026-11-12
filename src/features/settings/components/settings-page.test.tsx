import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./settings-page";

describe("settings page", () => {
  it("opens profile settings and switches detail tabs", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: /Profile and preferences/ }));
    expect(screen.getByRole("heading", { name: "Identity details" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Authentication" }));
    expect(screen.getByRole("heading", { name: "Sign-in details" })).toBeVisible();
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
