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
});

