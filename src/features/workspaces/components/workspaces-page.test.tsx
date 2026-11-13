import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspacesPage } from "./workspaces-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><WorkspacesPage /></QueryClientProvider>);
}

const workspace = {
  id: "workspace-existing", name: "Revenue Intelligence", description: "Revenue planning", created_by: "user-you",
  created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-12T10:00:00Z", archived_at: null, deleted_at: null,
};

describe("workspaces page", () => {
  afterEach(() => { vi.unstubAllGlobals(); push.mockReset(); });

  it("shows only backend workspaces and filters them", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [workspace], next_cursor: null }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("row", { name: /Revenue Intelligence/ })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Search workspaces" }), "missing");
    expect(screen.getByText("No matching workspaces")).toBeVisible();
  });

  it("creates a real workspace, uploads selected datasets, and opens it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], next_cursor: null }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...workspace, id: "workspace-new", name: "Finance Planning" }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resource: { id: "dataset-1", resource_type: "dataset", name: "finance.csv" }, link_id: "link-1" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No workspaces yet");
    await user.click(screen.getByRole("button", { name: "New Workspace" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Workspace name/), "Finance Planning");
    await user.upload(within(dialog).getByLabelText("Browse workspace datasets"), new File(["month,revenue"], "finance.csv", { type: "text/csv" }));
    await user.type(within(dialog).getByLabelText("AI Context"), "Track forecast accuracy");
    await user.click(within(dialog).getByRole("button", { name: "Create Workspace" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workspaces/workspace-new"));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ name: "Finance Planning", description: "Track forecast accuracy", ai_context: "Track forecast accuracy" });
    expect(fetchMock.mock.calls[2][1]?.body).toBeInstanceOf(FormData);
  });
});
