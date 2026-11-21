import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { WorkspaceAccessDialogs } from "./workspace-access-dialogs";

describe("workspace access dialogs", () => {
  it("persists invitations and lets their access change", async () => {
    type Invite = { id: string; workspace_id: string; email: string; role: "viewer" | "editor"; created_at: string };
    let invites: Invite[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/workspaces/workspace-1/invites") && (!init?.method || init.method === "GET")) return Response.json({ items: invites, next_cursor: null });
      if (url.endsWith("/workspaces/workspace-1/invites") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { email: string; role: Invite["role"] };
        invites = [{ id: "invite-1", workspace_id: "workspace-1", created_at: "2026-11-20T00:00:00Z", ...body }];
        return Response.json(invites[0], { status: 201 });
      }
      if (url.endsWith("/invites/invite-1") && init?.method === "PATCH") {
        invites = invites.map((invite) => ({ ...invite, ...JSON.parse(String(init.body)) }));
        return Response.json(invites[0]);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkspaceAccessDialogs workspaceId="workspace-1" workspaceName="Finance" /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "Share" }));
    const dialog = screen.getByRole("dialog", { name: "Share workspace" });
    await user.type(within(dialog).getByLabelText("Email address"), "Analyst@Example.com");
    await user.selectOptions(within(dialog).getByLabelText("Access for new person"), "editor");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    const access = await within(dialog).findByLabelText("Access for analyst@example.com");
    expect(access).toHaveValue("editor");
    await user.selectOptions(access, "viewer");
    await waitFor(() => expect(within(dialog).getByLabelText("Access for analyst@example.com")).toHaveValue("viewer"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/invites/invite-1"), expect.objectContaining({ method: "PATCH" }));
    vi.unstubAllGlobals();
  });

  it("opens the guarded ownership transfer UI", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><WorkspaceAccessDialogs workspaceId="workspace-1" workspaceName="Finance" /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    const dialog = screen.getByRole("dialog", { name: "Transfer Ownership" });
    const transfer = within(dialog).getByRole("button", { name: "Transfer Ownership" });
    expect(transfer).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New owner email"), "owner@example.com");
    await user.type(within(dialog).getByLabelText(/Type/), "TRANSFER");
    expect(transfer).toBeEnabled();
  });
});
