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
    await user.click(screen.getByRole("button", { name: "Library ownership: All" }));
    await user.click(screen.getByRole("button", { name: "Shared with me" }));
    expect(screen.getByText("Nothing shared with you yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Library ownership: Shared with me" }));
    await user.click(screen.getByRole("button", { name: "All", pressed: false }));
    const keyword = await screen.findByText("return");
    expect(keyword).toHaveStyle({ color: "#c586c0" });
    expect(keyword.closest("code")?.textContent).toBe("def total(left, right):\n    return left + right\n");
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

  it("groups a workspace with more than three items into a folder", async () => {
    const item = (id: string, name: string, workspace: [string, string] | null) => ({
      id, resource_type: "artifact", name, mime_type: "application/pdf", size_bytes: 10, origin: "generated", source: "output",
      preview_url: `/api/resources/${id}/preview`, download_url: `/api/resources/${id}/download`, kind: "pdf",
      library_category: "report", created_by: "user-you", created_at: "2026-11-13T00:00:00Z", run_id: null,
      in_library: true, library_created_at: "2026-11-13T00:00:00Z",
      workspace_id: workspace?.[0] ?? null, workspace_name: workspace?.[1] ?? null,
    });
    const sales: [string, string] = ["ws-sales", "Sales"];
    const small: [string, string] = ["ws-small", "Small"];
    const items = [
      item("a", "Q1.pdf", sales), item("b", "Q2.pdf", sales), item("c", "Q3.pdf", sales), item("d", "Q4.pdf", sales),
      item("e", "Tiny.pdf", small), item("f", "Loose.pdf", null),
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/library")) return Response.json({ items, next_cursor: null });
      throw new Error(`Unexpected request: ${String(input)}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><LibraryPage /></QueryClientProvider>);

    expect(await screen.findByText("Q1.pdf")).toBeVisible();
    expect(screen.getAllByText("From Sales")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Open Sales folder" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(screen.getByText("Q1.pdf")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Folders" }));
    const folder = await screen.findByRole("button", { name: "Open Sales folder" });
    expect(screen.queryByRole("button", { name: "Open Small folder" })).not.toBeInTheDocument();
    expect(screen.getByText("Tiny.pdf")).toBeVisible();
    expect(screen.getByText("Loose.pdf")).toBeVisible();
    expect(screen.queryByText("Q1.pdf")).not.toBeInTheDocument();

    await user.click(folder);
    expect(screen.getByText("Q4.pdf")).toBeVisible();
    expect(screen.queryByText("Loose.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Folders" }));
    expect(screen.getByText("Loose.pdf")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Search library" }), "Q2");
    expect(screen.getByText("Q2.pdf")).toBeVisible();
  });
});
