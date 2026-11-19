import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { streamQuickAssistantMessage } from "@/lib/api";
import { QuickAssistantPopup } from "./quick-assistant-popup";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getModels: vi.fn(async () => ({ default_model_id: "gemini-test", models: [{ id: "gemini-test", label: "Gemini Test", supported_efforts: ["low"], default_effort: "low" }], configuration_status: "ready" })),
    getQuickAssistantMessages: vi.fn(async () => ({ items: [], next_cursor: null })),
    streamQuickAssistantMessage: vi.fn(async (_input, onEvent) => {
      onEvent({ event_id: "quick-created", run_id: "quick-answer", type: "message.created", data: { message_id: "quick-answer" }, timestamp: "2026-11-09T00:00:00Z", sequence: 1 });
      onEvent({ event_id: "quick-completed", run_id: "quick-answer", type: "message.completed", data: { message_id: "quick-answer", content: "A concise side answer." }, timestamp: "2026-11-09T00:00:00Z", sequence: 2 });
    }),
  };
});

describe("QuickAssistantPopup", () => {
  it("asks against the main-chat snapshot taken when it opened", async () => {
    const user = userEvent.setup();
    render(<QuickAssistantPopup chatId="chat-1" snapshotMessageId="message-3" resources={[]} onFileSelect={vi.fn()} minimized={false} onMinimize={vi.fn()} onRestore={vi.fn()} onClose={vi.fn()} />);

    const input = await screen.findByRole("textbox", { name: "Ask Quick Assistant" });
    await screen.findByPlaceholderText("Ask a side question…");
    await user.type(input, "What does revenue mean here?{Enter}");

    expect(await screen.findByText("A concise side answer.")).toBeInTheDocument();
    expect(vi.mocked(streamQuickAssistantMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ context_id: "chat-1", content: "What does revenue mean here?", context_until_message_id: "message-3" }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("starts compact, expands after sending, and lets the user shrink it again", async () => {
    const user = userEvent.setup();
    render(<QuickAssistantPopup chatId="chat-1" snapshotMessageId={null} resources={[]} onFileSelect={vi.fn()} minimized={false} onMinimize={vi.fn()} onRestore={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Quick Assistant" });
    expect(dialog).toHaveAttribute("data-expanded", "false");

    await screen.findByPlaceholderText("Ask a side question…");
    await user.type(screen.getByRole("textbox", { name: "Ask Quick Assistant" }), "Short question{Enter}");
    expect(await screen.findByText("A concise side answer.")).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Shrink Quick Assistant" }));
    expect(dialog).toHaveAttribute("data-expanded", "false");
  });

  it("closes from its button and minimizes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMinimize = vi.fn();
    render(<QuickAssistantPopup chatId="chat-1" snapshotMessageId={null} resources={[]} onFileSelect={vi.fn()} minimized={false} onMinimize={onMinimize} onRestore={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close Quick Assistant" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("keeps the conversation while minimized and restores from the pill", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const props = { chatId: "chat-1", snapshotMessageId: null, resources: [], onFileSelect: vi.fn(), onMinimize: vi.fn(), onRestore, onClose: vi.fn() };
    const { rerender } = render(<QuickAssistantPopup {...props} minimized={false} />);
    await screen.findByPlaceholderText("Ask a side question…");
    await user.type(screen.getByRole("textbox", { name: "Ask Quick Assistant" }), "Keep me{Enter}");
    expect(await screen.findByText("A concise side answer.")).toBeInTheDocument();

    rerender(<QuickAssistantPopup {...props} minimized />);
    await user.click(screen.getByRole("button", { name: "Restore Quick Assistant" }));
    expect(onRestore).toHaveBeenCalledOnce();

    rerender(<QuickAssistantPopup {...props} minimized={false} />);
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(screen.getByText("A concise side answer.")).toBeInTheDocument();
  });
});
