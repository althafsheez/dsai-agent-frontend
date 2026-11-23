import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ContextFile } from "@/features/context-sidebar";
import type { ChatMessage } from "../types";
import { MessageList } from "./message-list";

it("offers Library actions for uploaded and generated files and reflects saved state", async () => {
  const file: ContextFile = {
    id: "file-1", name: "report.pdf", kind: "pdf", mime_type: "application/pdf", size_bytes: 10,
    origin: "uploaded", preview_url: null, download_url: "/download", created_by: "user-you",
    created_at: "2026-11-09T00:00:00Z", run_id: null, in_library: false,
  };
  const messages: ChatMessage[] = [
    { id: "user", role: "user", content: "Read this", createdAt: file.created_at, attachments: [{ id: file.id, name: file.name, kind: "PDF", size: "10 B" }] },
    { id: "assistant", role: "assistant", status: "completed", createdAt: file.created_at, blocks: [{ type: "file", id: file.id, name: file.name, kind: "PDF", size: "10 B" }] },
  ];
  const onLibraryToggle = vi.fn(async () => {});
  const props = { messages, onFileSelect: vi.fn(), registerSection: vi.fn(), onLibraryToggle };
  const { rerender } = render(<MessageList {...props} resources={new Map([[file.id, file]])} />);
  const user = userEvent.setup();
  const buttons = screen.getAllByRole("button", { name: "Add report.pdf to Library" });
  expect(buttons).toHaveLength(2);
  await user.click(buttons[0]);
  expect(onLibraryToggle).toHaveBeenCalledWith(file);
  rerender(<MessageList {...props} resources={new Map([[file.id, { ...file, in_library: true }]])} />);
  expect(screen.getAllByRole("button", { name: "Remove report.pdf from Library", pressed: true })).toHaveLength(2);
});
