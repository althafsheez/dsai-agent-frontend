"use client";

import { ArrowUp, LoaderCircle, Plus } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ContextSidebar, type ContextFile } from "@/features/context-sidebar";
import {
  createMessage,
  getChat,
  getMessages,
  getModels,
  getWorkspaces,
  streamChatRun,
  type ExecutionEvent,
  type MessageDto,
} from "@/lib/api";
import type { AssistantMessage, ChatMessage } from "../types";
import { takePendingRun } from "../pending-run";
import { ChatHeader } from "./chat-header";
import { ConversationNavigator } from "./conversation-navigator";
import { MessageList } from "./message-list";

function toMessage(message: MessageDto): ChatMessage {
  if (message.role === "user") {
    return { id: message.id, role: "user", content: message.content, createdAt: message.created_at };
  }
  const status: AssistantMessage["status"] = message.status === "completed"
    ? "completed"
    : message.status === "failed"
      ? "failed"
      : message.status === "interrupted" || message.status === "cancelled"
        ? "interrupted"
        : "running";
  return {
    id: message.id,
    role: "assistant",
    status,
    createdAt: message.created_at,
    blocks: [{ type: "markdown", content: message.content }],
  };
}

function eventString(event: ExecutionEvent, key: string): string | null {
  const value = event.data[key];
  return typeof value === "string" ? value : null;
}

export function ChatPage({ chatId }: { chatId: string }) {
  const queryClient = useQueryClient();
  const chatQuery = useQuery({ queryKey: ["chat", chatId], queryFn: () => getChat(chatId) });
  const messagesQuery = useQuery({ queryKey: ["chat", chatId, "messages"], queryFn: () => getMessages(chatId) });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>();
  const sections = useRef(new Map<string, HTMLElement>());
  const initialRunChecked = useRef(false);
  const streamController = useRef<AbortController | null>(null);
  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];
  const supportedEfforts = selectedModel?.supported_efforts ?? [];
  const workspaceName = workspacesQuery.data?.items.find(
    (workspace) => workspace.id === chatQuery.data?.workspace_id,
  )?.name;

  useEffect(() => {
    if (!messagesQuery.data) return;
    const next = messagesQuery.data.items.map(toMessage);
    setMessages(next);
    setActiveSection((current) => current ?? next.find((message) => message.role === "user")?.id);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!models.length) return;
    if (!models.some((model) => model.id === modelId)) {
      setModelId(modelsQuery.data?.default_model_id ?? models[0].id);
    }
  }, [modelId, models, modelsQuery.data?.default_model_id]);

  useEffect(() => {
    if (!selectedModel) return;
    if (!selectedModel.supported_efforts.includes(effort)) {
      setEffort(selectedModel.default_effort ?? selectedModel.supported_efforts[0] ?? "");
    }
  }, [effort, selectedModel]);

  useEffect(() => () => streamController.current?.abort(), []);

  const runMessage = useCallback(async (input: {
    userMessageId: string;
    modelId: string;
    effort: string | null;
    clientRequestId: string;
  }) => {
    const placeholderId = `assistant-pending-${input.clientRequestId}`;
    let assistantId = placeholderId;
    const controller = new AbortController();
    streamController.current = controller;
    setRunning(true);
    setError(null);
    setMessages((current) => [
      ...current,
      {
        id: placeholderId,
        role: "assistant",
        status: "running",
        createdAt: new Date().toISOString(),
        blocks: [{ type: "markdown", content: "" }],
      },
    ]);

    function updateAssistant(update: (message: AssistantMessage) => AssistantMessage) {
      setMessages((current) => current.map((message) => (
        message.role === "assistant" && (message.id === assistantId || message.id === placeholderId)
          ? update(message)
          : message
      )));
    }

    function onEvent(event: ExecutionEvent) {
      if (event.type === "agent.started") {
        const run = event.data.run;
        if (run && typeof run === "object" && "assistant_message_id" in run) {
          const id = (run as { assistant_message_id?: unknown }).assistant_message_id;
          if (typeof id === "string") {
            assistantId = id;
            updateAssistant((message) => ({ ...message, id }));
          }
        }
        return;
      }
      if (event.type === "message.created") {
        const id = eventString(event, "message_id");
        if (id) {
          assistantId = id;
          updateAssistant((message) => ({ ...message, id }));
        }
        return;
      }
      if (event.type === "message.delta") {
        const text = eventString(event, "text");
        if (!text) return;
        updateAssistant((message) => {
          const currentText = message.blocks[0]?.type === "markdown" ? message.blocks[0].content : "";
          return { ...message, blocks: [{ type: "markdown", content: currentText + text }] };
        });
        return;
      }
      if (event.type === "message.completed") {
        const content = eventString(event, "content") ?? "";
        updateAssistant((message) => ({
          ...message,
          status: "completed",
          blocks: [{ type: "markdown", content }],
        }));
        return;
      }
      if (event.type === "agent.failed") {
        const failure = event.data.error;
        const message = failure && typeof failure === "object" && "message" in failure
          ? String((failure as { message: unknown }).message)
          : "Gemini could not complete this response.";
        setError(message);
        updateAssistant((assistant) => ({ ...assistant, status: "failed" }));
        return;
      }
      if (event.type === "agent.cancelled" || event.type === "agent.interrupted") {
        updateAssistant((message) => ({ ...message, status: "interrupted" }));
      }
    }

    try {
      await streamChatRun(chatId, {
        user_message_id: input.userMessageId,
        model_id: input.modelId,
        effort: input.effort ?? undefined,
        client_request_id: input.clientRequestId,
      }, onEvent, controller.signal);
    } catch (caught) {
      if (controller.signal.aborted) {
        updateAssistant((message) => ({ ...message, status: "interrupted" }));
      } else {
        const message = caught instanceof Error ? caught.message : "The Gemini request failed.";
        setError(message);
        updateAssistant((assistant) => ({ ...assistant, status: "failed" }));
      }
    } finally {
      if (streamController.current === controller) streamController.current = null;
      setRunning(false);
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    }
  }, [chatId, queryClient]);

  useEffect(() => {
    if (initialRunChecked.current || !messagesQuery.data) return;
    initialRunChecked.current = true;
    const pending = takePendingRun(chatId);
    if (!pending) return;
    setModelId(pending.modelId);
    setEffort(pending.effort ?? "");
    void runMessage({
      userMessageId: pending.userMessageId,
      modelId: pending.modelId,
      effort: pending.effort,
      clientRequestId: pending.clientRequestId,
    });
  }, [chatId, messagesQuery.data, runMessage]);

  function selectFile(file: ContextFile | null) {
    setSelectedFile(file);
    setPanelOpen(true);
  }

  function togglePanel() {
    setPanelOpen((open) => {
      if (open) setSelectedFile(null);
      return !open;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selectedModel || running) return;
    setRunning(true);
    setError(null);
    try {
      const userMessage = await createMessage(chatId, {
        content,
        client_request_id: crypto.randomUUID(),
      });
      setMessages((current) => [...current, toMessage(userMessage)]);
      setDraft("");
      await runMessage({
        userMessageId: userMessage.id,
        modelId: selectedModel.id,
        effort: effort || null,
        clientRequestId: crypto.randomUUID(),
      });
    } catch (caught) {
      setRunning(false);
      setError(caught instanceof Error ? caught.message : "Could not send this message.");
    }
  }

  return (
    <section className="relative flex min-h-0 flex-1 overflow-hidden">
      <ConversationNavigator
        messages={messages}
        activeId={activeSection}
        onNavigate={(id) => {
          setActiveSection(id);
          sections.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <ChatHeader
          title={chatQuery.data?.title ?? "Loading conversation…"}
          workspaceName={workspaceName}
          panelOpen={panelOpen}
          onToggleRightPanel={togglePanel}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messagesQuery.isError ? (
            <div role="alert" className="mx-auto max-w-3xl px-5 py-10 text-sm text-red-300">
              Could not load this conversation. Is the backend running on port 8000?
            </div>
          ) : (
            <MessageList
              messages={messages}
              onFileSelect={() => undefined}
              registerSection={(id, node) => {
                if (node) sections.current.set(id, node);
                else sections.current.delete(id);
              }}
            />
          )}
        </div>
        <form className="shrink-0 border-t bg-background p-3 sm:p-4" onSubmit={submit}>
          <div className="mx-auto max-w-3xl rounded-lg border border-border-strong bg-surface p-2 focus-within:border-ring">
            <div className="flex items-end gap-2">
              <button type="button" aria-label="Add attachment unavailable" disabled className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-50"><Plus className="size-4" /></button>
              <label htmlFor="chat-message" className="sr-only">Ask anything about your data</label>
              <textarea
                id="chat-message"
                value={draft}
                disabled={running || messagesQuery.isError}
                onChange={(event) => { setDraft(event.target.value); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder={running ? "Gemini is responding…" : "Ask anything about your data…"}
                className="max-h-32 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              <button type="submit" disabled={!draft.trim() || running || !selectedModel} aria-label="Send message" className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-30">
                {running ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2 border-t px-1 pt-2">
              <label htmlFor="chat-model" className="text-[10px] text-muted-foreground">Model</label>
              <select id="chat-model" aria-label="Model" value={selectedModel?.id ?? ""} disabled={running || !models.length} onChange={(event) => setModelId(event.target.value)} className="max-w-[180px] rounded border bg-raised px-2 py-1 text-[11px] outline-none focus:border-ring disabled:opacity-50">
                {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <label htmlFor="chat-effort" className="text-[10px] text-muted-foreground">Effort</label>
              <select id="chat-effort" aria-label="Reasoning effort" value={effort} disabled={running || !supportedEfforts.length} onChange={(event) => setEffort(event.target.value)} className="rounded border bg-raised px-2 py-1 text-[11px] capitalize outline-none focus:border-ring disabled:opacity-50">
                {supportedEfforts.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>
          <div className="mx-auto mt-1.5 min-h-4 max-w-3xl text-[11px] text-muted-foreground" aria-live="polite">
            {error ? <p role="alert" className="text-red-300">{error}</p> : null}
          </div>
        </form>
      </div>

      {panelOpen ? (
        <div className="absolute inset-y-0 right-0 z-40 w-full bg-sidebar shadow-2xl sm:max-w-[360px] xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shrink-0 xl:shadow-none">
          <ContextSidebar
            chatId={chatId}
            workspaceId={chatQuery.data?.workspace_id ?? null}
            datasets={[]}
            artifacts={[]}
            selectedFile={selectedFile}
            onClose={() => { setSelectedFile(null); setPanelOpen(false); }}
            onFileSelect={selectFile}
          />
        </div>
      ) : null}
    </section>
  );
}
