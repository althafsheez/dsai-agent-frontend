import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
  const base = { checkedAt: Date.now(), dataChangedAt: null, syncIssue: false };

  it("says live when published, with no refresh button or schedule", () => {
    render(<DataStatus {...base} live dataChangedAt={new Date(Date.now() - 120_000).toISOString()} />);
    expect(screen.getByText(/live · data changed 2 min ago/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says a draft shows a snapshot, and warns when Drive could not be reached", () => {
    render(<DataStatus {...base} live={false} syncIssue />);
    expect(screen.getByText(/showing the data as of/)).toBeVisible();
    expect(screen.getByText(/Could not reach Google Drive/)).toBeVisible();
  });
});
