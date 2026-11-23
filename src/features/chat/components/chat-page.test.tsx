import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageDto } from "@/lib/api";
import { savePendingRun } from "../pending-run";
import { ChatPage } from "./chat-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  let holdStreamOpen: boolean;
  let openStreamController: ReadableStreamDefaultController<Uint8Array> | null;
  let pendingCreate: Promise<void> | null;
  let resolvePendingCreate: (() => void) | null;

  beforeEach(() => {
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    persistedMessages = [{ ...initialMessage }];
    holdStreamOpen = false;
    openStreamController = null;
    pendingCreate = null;
    resolvePendingCreate = null;
    let nextUser = 1;
    const queued = new Map<string, MessageDto>();
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/models")) return json(models);
      if (url.endsWith("/workspaces")) return json({ items: [], next_cursor: null });
      if (url.endsWith(`/chats/${chat.id}`)) return json(chat);
      if (url.endsWith(`/chats/${chat.id}/messages`) && !init?.method) {
        return json({ items: persistedMessages, next_cursor: null });
      }
      if (url.endsWith(`/chats/${chat.id}/runs`) && !init?.method) return json({ items: [], next_cursor: null });
      if (url.endsWith(`/chats/${chat.id}/messages`) && init?.method === "POST") {
        if (pendingCreate) await pendingCreate;
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
      if (url.endsWith("/resources/upload") && init?.method === "POST") {
        const body = init.body as FormData;
        const file = body.get("file") as File;
        const resourceType = file.name.endsWith(".csv") ? "dataset" : "artifact";
        return json({ resource: { id: `resource-${resourceType}`, resource_type: resourceType, name: file.name }, link_id: `link-${resourceType}` }, 201);
      }
      if (url.includes(`/datasets?chat_id=${chat.id}`)) return json({
        items: [{
          id: "resource-dataset", name: "sales.csv", mime_type: "text/csv", size_bytes: 12,
          origin: "uploaded", preview_url: "/api/resources/resource-dataset/preview",
          download_url: "/api/resources/resource-dataset/download", created_by: "user-you",
          created_at: "2026-11-09T00:01:00Z", row_count: null, column_count: null,
          columns: [], preview_rows: [], scope_type: "chat", run_id: null,
        }], next_cursor: null,
      });
      if (url.includes(`/artifacts?chat_id=${chat.id}`)) return json({
        items: [{
          id: "resource-artifact", name: "summary.pdf", mime_type: "application/pdf", size_bytes: 20,
          origin: "uploaded", preview_url: "/api/resources/resource-artifact/preview",
          download_url: "/api/resources/resource-artifact/download", kind: "pdf", created_by: "user-you",
          created_at: "2026-11-09T00:01:00Z", run_id: null, saved: false,
        }], next_cursor: null,
      });
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
          event("tool.started", 3, { tool_call_id: "tool-1", name: "execute_python", arguments: { code: "print(1)" } }),
          event("tool.completed", 4, { tool_call_id: "tool-1", name: "execute_python", output: { success: true } }),
          event("dataset.created", 5, { dataset: { id: "resource-dataset", name: "sales.csv", size_bytes: 12 } }),
          event("message.delta", 6, { message_id: assistantId, text: "Streamed " }),
          event("message.delta", 7, { message_id: assistantId, text: "answer" }),
          event("message.completed", 8, { message_id: assistantId, content: "Streamed answer", status: "completed" }),
          event("agent.completed", 9, { run_id: "run-real" }),
        ].join("");
        if (holdStreamOpen) {
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              openStreamController = controller;
              controller.enqueue(encoder.encode(frames.slice(0, frames.indexOf("id: event-2"))));
            },
          });
          return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
        }
        return new Response(frames, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.endsWith("/runs/run-real/cancel") && init?.method === "POST") {
        return json({ run_id: "run-real", status: "cancellation_requested" }, 202);
      }
      if (/\/runs\/run-real\/queue(?:\/with-files)?$/.test(url) && init?.method === "POST") {
        const form = init.body instanceof FormData ? init.body : null;
        const content = form
          ? String(form.get("content"))
          : (JSON.parse(String(init.body)) as { content: string }).content;
        const runId = `run-queued-${queued.size + 1}`;
        const message: MessageDto = {
          ...initialMessage,
          id: `message-${runId}`,
          content,
          status: "queued",
          attachment_refs: (form?.getAll("files") as File[] | undefined)?.map((file) => ({
            resource_id: file.name,
            resource_type: file.name.endsWith(".csv") ? "dataset" : "artifact",
            name: file.name,
            size_bytes: file.size,
          })) ?? [],
        };
        queued.set(runId, message);
        return json({
          message,
          run: {
            id: runId,
            chat_id: chat.id,
            user_message_id: "message-queued",
            assistant_message_id: "assistant-queued",
            status: "queued",
            model_id: "gemini-fast",
            effort: "medium",
            client_request_id: "queue-request",
            previous_run_id: null,
            created_at: "2026-11-09T00:03:00Z",
            started_at: null,
            finished_at: null,
            error_code: null,
            error_detail: null,
          },
          position: queued.size,
        }, 201);
      }
      if (url.endsWith("/runs/run-real/steer") && init?.method === "POST") {
        return json({ instruction: { id: "steer-1", run_id: "run-real", message_id: "steer-message", status: "received", checkpoint: null, created_at: "2026-11-09T00:03:00Z" } }, 201);
      }
      if (url.endsWith(`/chats/${chat.id}/queue/order`) && init?.method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      const queuedId = url.match(/\/runs\/(run-queued-\d+)\/queue(?:\/with-files)?$/)?.[1];
      if (queuedId && init?.method === "DELETE") {
        queued.delete(queuedId);
        return new Response(null, { status: 204 });
      }
      if (queuedId && init?.method === "PATCH") {
        const form = init.body as FormData;
        const content = String(form.get("content"));
        const removed = form.getAll("remove_resource_ids").map(String);
        const additions = (form.getAll("files") as File[]).map((file) => ({
          resource_type: "dataset" as const, resource_id: file.name, name: file.name, size_bytes: file.size,
        }));
        const message = queued.get(queuedId)!;
        const updated = { ...message, content, attachment_refs: [...message.attachment_refs.filter((file) => !removed.includes(file.resource_id)), ...additions] };
        queued.set(queuedId, updated);
        return json(updated);
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
    await user.type(screen.getByRole("combobox", { name: "Ask anything about your data" }), "Follow up");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Streamed answer")).toBeInTheDocument();
    expect(screen.getByText("Execute Python")).toBeVisible();
    expect(screen.getByText("Reasoning Trace")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview sales.csv" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Preview sales.csv" }));
    expect(await screen.findByRole("dialog", { name: "Preview sales.csv" })).toBeVisible();
    const streamCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/messages/stream"));
    expect(JSON.parse(String(streamCall?.[1]?.body))).toMatchObject({
      model_id: "gemini-pro",
      effort: "low",
    });
    expect(screen.getByText("Follow up")).toBeInTheDocument();
  });

  it("shows a submitted question immediately while message creation is still pending", async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText("Stored question");
    pendingCreate = new Promise<void>((resolve) => { resolvePendingCreate = resolve; });

    await user.type(screen.getByRole("combobox", { name: "Ask anything about your data" }), "Show this immediately");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Show this immediately")).toBeVisible();
    expect(screen.getByText("Stored question")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to question: Show this immediately" })).toHaveAttribute("aria-current", "location");
    resolvePendingCreate?.();
    expect(await screen.findByText("Streamed answer")).toBeVisible();
  });

  it("adds multiple files, uploads them before the run, and catalogs datasets and artifacts", async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText("Stored question");

    await user.click(screen.getByRole("button", { name: "Add files or connectors" }));
    expect(screen.getByRole("dialog", { name: "Add files and connectors" })).toBeVisible();
    expect(screen.getByText("Snowflake")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Apps & Tools" }));
    expect(screen.getByText("Jira")).toBeVisible();
    expect(screen.getByText("Slack")).toBeVisible();
    expect(screen.queryByText("Snowflake")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Data Sources" }));
    expect(screen.getByText("Google BigQuery")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByText("Forecasting")).toBeVisible();
    await user.upload(screen.getByLabelText("Add files to chat"), [
      new File(["month,revenue"], "sales.csv", { type: "text/csv" }),
      new File(["report"], "summary.pdf", { type: "application/pdf" }),
    ]);

    const attachments = screen.getByLabelText("Selected chat attachments");
    expect(within(attachments).getByText("sales.csv")).toBeVisible();
    expect(within(attachments).getByText("summary.pdf")).toBeVisible();
    await user.type(screen.getByRole("combobox", { name: "Ask anything about your data" }), "Analyze these files");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("complementary", { name: "Analysis context" })).toBeVisible();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/resources/upload"))).toHaveLength(2));
    expect((await screen.findAllByText("sales.csv")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Artifacts" }));
    expect((await screen.findAllByText("summary.pdf")).length).toBeGreaterThan(0);
  });

  it("switches between the slash picker and attachment popup without overlapping them", async () => {
    const user = userEvent.setup();
    renderChat();
    const composer = await screen.findByRole("combobox", { name: "Ask anything about your data" });
    const attachments = screen.getByRole("button", { name: "Add files or connectors" });

    await user.type(composer, "/");
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeVisible();
    await user.click(attachments);
    expect(screen.getByRole("dialog", { name: "Add files and connectors" })).toBeVisible();
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
    await user.clear(composer);
    await user.type(composer, "/help");
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Add files and connectors" })).not.toBeInTheDocument();
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

  it("keeps the composer editable during a run and supports queue, remove, and steer", async () => {
    holdStreamOpen = true;
    const user = userEvent.setup();
    renderChat();
    const composer = await screen.findByRole("combobox", { name: "Ask anything about your data" });

    await user.type(composer, "Start a long analysis");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(composer).toHaveAttribute("placeholder", "Type a follow-up to queue or steer…"));
    // The first SSE event arrives while getMessages still contains the old
    // cache. The submitted user bubble must remain visible in that gap.
    expect(screen.getByText("Start a long analysis")).toBeVisible();

    await user.type(composer, "Compare this with last quarter");
    expect(composer).toBeEnabled();
    expect(screen.getByRole("button", { name: "Queue" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Steer" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add files or connectors" }));
    expect(screen.getByRole("dialog", { name: "Add files and connectors" })).toBeVisible();
    await user.upload(screen.getByLabelText("Add files to chat"), [
      new File(["quarter,revenue"], "revenue.csv", { type: "text/csv" }),
      new File(["select 1"], "analysis.sql", { type: "text/plain" }),
    ]);
    expect(screen.getByRole("button", { name: "Steer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Queue" }));
    expect(await screen.findByText("Compare this with last quarter")).toBeVisible();
    expect(within(screen.getByRole("list", { name: "Queued questions" })).queryByText("Queued", { exact: true })).not.toBeInTheDocument();
    const queuedUpload = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/queue/with-files"));
    const form = queuedUpload?.[1]?.body as FormData;
    expect(form.getAll("files").map((file) => (file as File).name)).toEqual(["revenue.csv", "analysis.sql"]);
    await user.type(composer, "Summarize the trend");
    await user.click(screen.getByRole("button", { name: "Queue" }));
    const grip = await screen.findByRole("button", { name: "Reorder queued question: Summarize the trend" });
    grip.focus();
    await user.keyboard("{ArrowUp}");
    const queue = within(screen.getByRole("list", { name: "Queued questions" }));
    await waitFor(() => expect(queue.getAllByRole("listitem")[0]).toHaveTextContent("Summarize the trend"));
    const moveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/queue/order"));
    expect(JSON.parse(String(moveCall?.[1]?.body))).toEqual({ run_ids: ["run-queued-2", "run-queued-1"] });

    await user.type(composer, "Focus only on enterprise customers");
    await user.click(screen.getByRole("button", { name: "Edit queued question: Compare this with last quarter" }));
    const edit = screen.getByRole("textbox", { name: "Edit queued question" });
    expect(edit).toBe(composer);
    expect(edit).toHaveFocus();
    const regionalFile = new File(["region,revenue"], "regional.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("Select files for queued question"), regionalFile);
    expect(screen.getByText("regional.csv")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove analysis.sql" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(composer).toHaveValue("Focus only on enterprise customers");
    expect(screen.queryByText("regional.csv")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/queue/with-files") && init?.method === "PATCH")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Edit queued question: Compare this with last quarter" }));
    expect(screen.getByText("analysis.sql")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove analysis.sql" }));
    await user.upload(screen.getByLabelText("Select files for queued question"), regionalFile);
    expect(screen.getByText("revenue.csv")).toBeVisible();
    await user.clear(edit);
    await user.type(edit, "Compare by region");
    await user.click(screen.getByRole("button", { name: "Save question" }));
    const editCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/runs/run-queued-1/queue/with-files") && init?.method === "PATCH");
    const editForm = editCall?.[1]?.body as FormData;
    expect(editForm.get("content")).toBe("Compare by region");
    expect(editForm.getAll("remove_resource_ids")).toEqual(["analysis.sql"]);
    expect((editForm.get("files") as File).name).toBe("regional.csv");
    expect(await queue.findByLabelText("revenue.csv, regional.csv")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Remove queued question: Compare by region" }));
    await waitFor(() => expect(screen.queryByText("Compare by region")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Steer" }));
    expect(await screen.findByText("Steering instruction sent to the active run.")).toBeVisible();
    const steerCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/runs/run-real/steer"));
    expect(JSON.parse(String(steerCall?.[1]?.body))).toMatchObject({ content: "Focus only on enterprise customers" });

    openStreamController?.close();
  });

  it("stops the active run through its cancellation endpoint", async () => {
    holdStreamOpen = true;
    const user = userEvent.setup();
    renderChat();
    const composer = await screen.findByRole("combobox", { name: "Ask anything about your data" });

    await user.type(composer, "Start a cancellable analysis");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop" })).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Stop" }));

    const cancelCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/runs/run-real/cancel"));
    expect(JSON.parse(String(cancelCall?.[1]?.body))).toEqual({ reason: "user" });
    expect(await screen.findByText("Stopping the active run…")).toBeVisible();
    openStreamController?.close();
  });

  it("opens the slash command picker and runs /status without sending a message", async () => {
    const user = userEvent.setup();
    renderChat();
    const composer = await screen.findByRole("combobox", { name: "Ask anything about your data" });
    await waitFor(() => expect(composer).toBeEnabled());
    await user.type(composer, "/sta");
    const menu = screen.getByRole("listbox", { name: "Slash commands" });
    expect(within(menu).getByRole("option", { selected: true })).toHaveTextContent("/status");
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/· idle · 0 queued/)).toBeVisible();
    expect(composer).toHaveValue("");
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
  });
});
