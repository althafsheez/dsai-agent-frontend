import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HistoryRecord } from "../types";
import { HistoryTable } from "./history-table";

const chat: HistoryRecord = { kind: "chat", id: "revenue", name: "Revenue", workspace_id: null, workspace_name: null, author: { id: "user-you", name: "You" }, updated_at: new Date().toISOString(), archived_at: null, deleted_at: null };
const workspace: HistoryRecord = { ...chat, kind: "workspace", id: "research", name: "Research" };

describe("HistoryTable", () => {
  it("provides chat and workspace navigation", () => {
    render(<HistoryTable records={[chat, workspace]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Revenue" })).toHaveAttribute("href", "/chat/revenue");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/workspaces/research");
  });

  it("invokes archive and restore actions", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<HistoryTable records={[chat]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={onArchive} onDelete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Actions for Revenue" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledWith(chat, true);

    const archived = { ...chat, archived_at: new Date().toISOString() };
    rerender(<HistoryTable records={[archived]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={onArchive} onDelete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Actions for Revenue" }));
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onArchive).toHaveBeenLastCalledWith(archived, false);
  });

  it("confirms before deleting a chat", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<HistoryTable records={[chat]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Actions for Revenue" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete Revenue?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(chat);
  });

  it("keeps only one row actions menu open", async () => {
    const user = userEvent.setup();
    render(<HistoryTable records={[chat, workspace]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Actions for Revenue" }));
    expect(screen.getByRole("menu", { name: "Actions for Revenue" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Actions for Research" }));
    expect(screen.queryByRole("menu", { name: "Actions for Revenue" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Actions for Research" })).toBeVisible();
  });

  it("selects all visible records and bulk deletes after confirmation", async () => {
    const user = userEvent.setup();
    const onDeleteMany = vi.fn().mockResolvedValue(undefined);
    render(<HistoryTable records={[chat, workspace]} loading={false} hasFilters={false} onClearFilters={vi.fn()} onRename={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} onDeleteMany={onDeleteMany} />);

    await user.click(screen.getByRole("checkbox", { name: "Select all history" }));
    expect(screen.getByText("2 selected")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Select Revenue" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Research" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.getByRole("dialog", { name: "Delete 2 selected items?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete selected" }));

    expect(onDeleteMany).toHaveBeenCalledWith([chat, workspace]);
  });
});
