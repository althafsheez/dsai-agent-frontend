import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryPage } from "./library-page";

describe("library page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads, searches, and removes real backend Library files", async () => {
    let items = [{
      id: "resource-1", resource_type: "artifact", name: "Revenue report.pdf",
      mime_type: "application/pdf", size_bytes: 1024, origin: "generated", source: "output",
      preview_url: "/api/resources/resource-1/preview", download_url: "/api/resources/resource-1/download",
      kind: "pdf", library_category: "report", created_by: "user-you", created_at: "2026-11-13T00:00:00Z", run_id: "run-1",
      in_library: true, library_created_at: "2026-11-13T00:00:00Z",
    }, {
      id: "resource-2", resource_type: "artifact", name: "Revenue chart.png",
      mime_type: "image/png", size_bytes: 2048, origin: "generated", source: "output",
      preview_url: "/api/resources/resource-2/preview", download_url: "/api/resources/resource-2/download",
      kind: "image", library_category: "visual", created_by: "user-you", created_at: "2026-11-13T00:00:00Z", run_id: "run-1",
      in_library: true, library_created_at: "2026-11-13T00:00:00Z",
    }, {
      id: "resource-3", resource_type: "artifact", name: "total.py",
      mime_type: "text/x-python", size_bytes: 128, origin: "generated", source: "output",
      preview_url: "/api/resources/resource-3/preview", download_url: "/api/resources/resource-3/download",
      kind: "code", library_category: "code", created_by: "user-you", created_at: "2026-11-13T00:00:00Z", run_id: "run-1",
      in_library: true, library_created_at: "2026-11-13T00:00:00Z",
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/library")) return Response.json({ items, next_cursor: null });
      if (url.endsWith("/api/resources/resource-3/preview")) return new Response("def total(left, right):\n    return left + right\n");
      if (url.endsWith("/api/resources/resource-1/library") && init?.method === "DELETE") {
        items = [];
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><LibraryPage /></QueryClientProvider>);

    expect(await screen.findByText("Revenue report.pdf")).toBeVisible();
    expect(await screen.findByText(/return left \+ right/)).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Visuals" }));
    expect(screen.getByText("Revenue chart.png")).toBeVisible();
    expect(screen.queryByText("Revenue report.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search library" }), "missing");
    expect(screen.getByText("No matching files")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.click(screen.getByRole("button", { name: "Remove Revenue report.pdf from Library" }));
    await waitFor(() => expect(screen.getByText("Your Library is empty")).toBeVisible());
  });

  it("supports favorite/unfavorite actions, filtering by favorites, and persists in localStorage", async () => {
    localStorage.clear();
    const items = [
      {
        id: "res-1",
        resource_type: "artifact",
        name: "Quarterly Forecast.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        origin: "generated",
        source: "output",
        preview_url: null,
        download_url: "/api/resources/res-1/download",
        kind: "pdf",
        library_category: "report",
        created_by: "user-you",
        created_at: "2026-11-13T00:00:00Z",
        run_id: "run-1",
        in_library: true,
        library_created_at: "2026-11-13T00:00:00Z",
      },
      {
        id: "res-2",
        resource_type: "dataset",
        name: "churn_rates.csv",
        mime_type: "text/csv",
        size_bytes: 4096,
        origin: "uploaded",
        source: "input",
        preview_url: null,
        download_url: "/api/resources/res-2/download",
        library_category: "dataset",
        created_by: "user-you",
        created_at: "2026-11-13T00:00:00Z",
        row_count: 50,
        column_count: 4,
        scope_type: "workspace",
        run_id: null,
        in_library: true,
        library_created_at: "2026-11-13T00:00:00Z",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items, next_cursor: null }))
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <LibraryPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Quarterly Forecast.pdf")).toBeVisible();
    expect(screen.getByText("churn_rates.csv")).toBeVisible();

    // Favorite the first item
    const favButtons = screen.getAllByRole("button", { name: "Favorite Quarterly Forecast.pdf" });
    await user.click(favButtons[0]);

    // Check localStorage persistence
    const stored = JSON.parse(localStorage.getItem("dsai:library:favorites") || "[]");
    expect(stored).toContain("res-1");

    // Click Favorites tab
    await user.click(screen.getByRole("tab", { name: /Favorites/ }));
    expect(screen.getByText("Quarterly Forecast.pdf")).toBeVisible();
    expect(screen.queryByText("churn_rates.csv")).not.toBeInTheDocument();

    // Unfavorite the item
    const unfavButtons = screen.getAllByRole("button", { name: "Unfavorite Quarterly Forecast.pdf" });
    await user.click(unfavButtons[0]);

    // Now favorites is empty
    expect(await screen.findByText("No favorite files yet")).toBeVisible();
    const storedAfter = JSON.parse(localStorage.getItem("dsai:library:favorites") || "[]");
    expect(storedAfter).not.toContain("res-1");
  });
});
