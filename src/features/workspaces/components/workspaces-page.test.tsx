import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspacesPage } from "./workspaces-page";

describe("workspaces page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("filters rows and keeps pinned workspaces before sorted unpinned rows", async () => {
    const user = userEvent.setup();
    render(<WorkspacesPage />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort workspaces" }), "name_asc");
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Revenue Intelligence")).toBeVisible();
    expect(within(rows[1]).getByText("Sales Research")).toBeVisible();
    expect(within(rows[2]).getByText("Customer Analytics")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Shared" }));
    expect(screen.getByRole("row", { name: /Sales Research/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /Revenue Intelligence/ })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search workspaces" }), "market");
    expect(screen.getByRole("row", { name: /Market Insights/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /Sales Research/ })).not.toBeInTheDocument();
  });

  it("opens the creation dialog, keeps dataset files local, and creates the workspace record", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      id: "workspace-new",
      name: "Finance Planning",
      description: "Track forecast accuracy",
      created_by: "user-you",
      created_at: "2026-11-11T10:00:00Z",
      updated_at: "2026-11-11T10:00:00Z",
      archived_at: null,
      deleted_at: null,
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspacesPage />);

    await user.click(screen.getByRole("button", { name: "New Workspace" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Workspace name/), "Finance Planning");
    await user.upload(within(dialog).getByLabelText("Browse workspace datasets"), new File(["month,revenue"], "finance.csv", { type: "text/csv" }));
    expect(within(dialog).getByText("finance.csv")).toBeVisible();
    expect(within(dialog).getByText(/will not be uploaded/)).toBeVisible();
    await user.type(within(dialog).getByLabelText("AI Context"), "Track forecast accuracy");
    await user.click(within(dialog).getByRole("button", { name: "Create Workspace" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("row", { name: /Finance Planning/ })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ name: "Finance Planning", description: "Track forecast accuracy" });
  });
});
