import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataStatus, ago } from "./data-status";

describe("ago", () => {
  it("describes elapsed time in plain words", () => {
    const now = 1_000_000_000;
    expect(ago(now - 3_000, now)).toBe("just now");
    expect(ago(now - 30_000, now)).toBe("30s ago");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(ago(now - 72 * 3_600_000, now)).toBe("3 d ago");
  });
});

describe("DataStatus", () => {
  const base = { checkedAt: Date.now(), dataChangedAt: null, refreshing: false, syncIssue: false, refreshMinutes: 0, onRefresh: vi.fn() };

  it("refreshes on click and lets editors pick the auto-refresh schedule", async () => {
    const onRefresh = vi.fn();
    const onRefreshMinutes = vi.fn();
    render(<DataStatus {...base} onRefresh={onRefresh} onRefreshMinutes={onRefreshMinutes} />);
    await userEvent.click(screen.getByRole("button", { name: /Refresh data/ }));
    expect(onRefresh).toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Auto-refresh" }), "5");
    expect(onRefreshMinutes).toHaveBeenCalledWith(5);
  });

  it("shows the schedule as text for viewers and warns when Drive could not be reached", () => {
    render(<DataStatus {...base} refreshMinutes={15} syncIssue />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Every 15 min")).toBeVisible();
    expect(screen.getByText(/Could not reach Google Drive/)).toBeVisible();
  });
});
