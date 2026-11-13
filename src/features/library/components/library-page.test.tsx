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
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/library")) return Response.json({ items, next_cursor: null });
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
});
