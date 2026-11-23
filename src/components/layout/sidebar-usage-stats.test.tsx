import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarUsageStats } from "./sidebar-usage-stats";

describe("SidebarUsageStats", () => {
  it("renders full usage statistics in expanded mode", () => {
    render(<SidebarUsageStats compact={false} />);

    expect(screen.getByTestId("sidebar-usage-stats")).toBeInTheDocument();
    expect(screen.getByText("Usage Statistics")).toBeInTheDocument();
    expect(screen.getByText("Free Tier")).toBeInTheDocument();
    expect(screen.getByText("19 / 50")).toBeInTheDocument();
    expect(screen.getByText(/40\.4 KB \/ 100 MB/)).toBeInTheDocument();
  });

  it("renders compact mode icon link with title", () => {
    render(<SidebarUsageStats compact={true} />);

    const link = screen.getByRole("link", { name: "View usage statistics" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveAttribute("title", expect.stringContaining("Usage: 19/50 runs"));
  });
});
