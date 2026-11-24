import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarUsageStats } from "./sidebar-usage-stats";

describe("SidebarUsageStats", () => {
  it("renders full usage statistics in expanded mode", () => {
    render(<SidebarUsageStats compact={false} />);

    expect(screen.getByTestId("sidebar-usage-stats")).toBeInTheDocument();
    expect(screen.getByText("Usage Stats")).toBeInTheDocument();
    expect(screen.getByText("65% used")).toBeInTheDocument();
    expect(screen.getByText("AI Credits")).toBeInTheDocument();
    expect(screen.getByText("3,250 / 5,000")).toBeInTheDocument();
    expect(screen.getByText("Disk Space")).toBeInTheDocument();
    expect(screen.getByText("0 MB / 100 MB")).toBeInTheDocument();
    expect(screen.getByText("Compute Time")).toBeInTheDocument();
    expect(screen.getByText("42h / 100h")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View usage analytics (sample)" })).toHaveAttribute("href", "/settings?view=usage");
  });

  it("renders compact mode icon link with title", () => {
    render(<SidebarUsageStats compact={true} />);

    const link = screen.getByRole("link", { name: "View usage statistics" });
    expect(link).toHaveAttribute("href", "/settings?view=usage");
    expect(link).toHaveAttribute("title", expect.stringContaining("65% used"));
  });
});
