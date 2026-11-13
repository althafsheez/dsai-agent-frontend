import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceAccessDialogs } from "./workspace-access-dialogs";

describe("workspace access dialogs", () => {
  it("adds workspace members and allows their role to change", async () => {
    const user = userEvent.setup();
    render(<WorkspaceAccessDialogs workspaceId="workspace-1" workspaceName="Finance" />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    const dialog = screen.getByRole("dialog", { name: "Share Workspace" });
    await user.type(within(dialog).getByLabelText("Email address"), "analyst@example.com");
    await user.selectOptions(within(dialog).getByLabelText("New member role"), "viewer");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    const memberRole = within(dialog).getByLabelText("Role for analyst@example.com");
    expect(memberRole).toHaveValue("viewer");
    await user.selectOptions(memberRole, "admin");
    expect(memberRole).toHaveValue("admin");
  });

  it("opens the guarded ownership transfer UI", async () => {
    const user = userEvent.setup();
    render(<WorkspaceAccessDialogs workspaceId="workspace-1" workspaceName="Finance" />);

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    const dialog = screen.getByRole("dialog", { name: "Transfer Ownership" });
    const transfer = within(dialog).getByRole("button", { name: "Transfer Ownership" });
    expect(transfer).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New owner email"), "owner@example.com");
    await user.type(within(dialog).getByLabelText(/Type/), "TRANSFER");
    expect(transfer).toBeEnabled();
  });
});
