import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageDto } from "@/lib/api";
import { savePendingRun } from "../pending-run";
import { ChatPage } from "./chat-page";

const chat = {
  id: "chat-real",
  title: "Stored conversation",
  title_source: "fallback" as const,
  workspace_id: null,
  created_by: "user-you",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  archived_at: null,
  deleted_at: null,
  first_run_at: null,
};

const initialMessage: MessageDto = {
  id: "message-initial",
  chat_id: chat.id,
  role: "user",
  kind: "normal",
  content: "Stored question",
  status: "completed",
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  attachment_refs: [],
};

const models = {
  default_model_id: "gemini-fast",
  configuration_status: "ready",
  models: [
    { id: "gemini-fast", label: "Gemini Fast", supported_efforts: ["low", "medium"], default_effort: "medium" },
    { id: "gemini-pro", label: "Gemini Pro", supported_efforts: ["low", "high"], default_effort: "high" },
  ],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function event(type: string, sequence: number, data: Record<string, unknown>) {
  const envelope = JSON.stringify({
    event_id: `event-${sequence}`,
    run_id: "run-real",
    type,
    data,
    timestamp: "2026-11-09T00:00:00Z",
    sequence,
  });
  return `id: event-${sequence}\nevent: ${type}\ndata: ${envelope}\n\n`;
}

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPage chatId={chat.id} />
    </QueryClientProvider>,
  );
}

describe("live chat page", () => {
  let persistedMessages: MessageDto[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    persistedMessages = [{ ...initialMessage }];
    let nextUser = 1;
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/models")) return json(models);
      if (url.endsWith("/workspaces")) return json({ items: [], next_cursor: null });
      if (url.endsWith(`/chats/${chat.id}`)) return json(chat);
      if (url.endsWith(`/chats/${chat.id}/messages`) && !init?.method) {
        return json({ items: persistedMessages, next_cursor: null });
      }
      if (url.endsWith(`/chats/${chat.id}/messages`) && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { content: string };
        const message: MessageDto = {
          ...initialMessage,
          id: `message-follow-up-${nextUser++}`,
          content: body.content,
          created_at: "2026-11-09T00:01:00Z",
          updated_at: "2026-11-09T00:01:00Z",
        };
        persistedMessages.push(message);
        return json(message, 201);
      }
      if (url.endsWith(`/chats/${chat.id}/messages/stream`) && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { user_message_id: string };
        const assistantId = `assistant-${body.user_message_id}`;
        persistedMessages.push({
          ...initialMessage,
          id: assistantId,
          role: "assistant",
          content: "Streamed answer",
          created_at: "2026-11-09T00:02:00Z",
          updated_at: "2026-11-09T00:02:00Z",
        });
        const frames = [
          event("agent.started", 1, { run: { id: "run-real", assistant_message_id: assistantId } }),
          event("message.created", 2, { message_id: assistantId, role: "assistant" }),
          event("message.delta", 3, { message_id: assistantId, text: "Streamed " }),
          event("message.delta", 4, { message_id: assistantId, text: "answer" }),
          event("message.completed", 5, { message_id: assistantId, content: "Streamed answer", status: "completed" }),
          event("agent.completed", 6, { run_id: "run-real" }),
        ].join("");
        return new Response(frames, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `request-${Math.random()}`) });
  });

  it("loads persisted messages and streams a follow-up with the selected model and effort", async () => {
    const user = userEvent.setup();
    renderChat();
    expect(await screen.findByText("Stored question")).toBeInTheDocument();
    expect(screen.getByText("Live Gemini")).toBeVisible();

    await user.selectOptions(screen.getByRole("combobox", { name: "Model" }), "gemini-pro");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reasoning effort" }), "low");
    await user.type(screen.getByRole("textbox", { name: "Ask anything about your data" }), "Follow up");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Streamed answer")).toBeInTheDocument();
    const streamCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/messages/stream"));
    expect(JSON.parse(String(streamCall?.[1]?.body))).toMatchObject({
      model_id: "gemini-pro",
      effort: "low",
    });
    expect(screen.getByText("Follow up")).toBeInTheDocument();
  });

  it("starts the first pending backend run after navigation from New Analysis", async () => {
    savePendingRun({
      chatId: chat.id,
      userMessageId: initialMessage.id,
      modelId: "gemini-fast",
      effort: "medium",
      clientRequestId: "initial-run-request",
    });
    renderChat();

    expect(await screen.findByText("Streamed answer")).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(`dsai:pending-run:${chat.id}`)).toBeNull());
    const streamCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/messages/stream"));
    expect(JSON.parse(String(streamCall?.[1]?.body))).toMatchObject({
      user_message_id: initialMessage.id,
      model_id: "gemini-fast",
      effort: "medium",
      client_request_id: "initial-run-request",
    });
  });
});
