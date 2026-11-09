"use client";

import { ArrowUp, Plus } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { ContextSidebar, type ContextFile } from "@/features/context-sidebar";
import { chatMockAdapter } from "../mock-adapter";
import { mockResponseText } from "../mock-data";
import type { AssistantMessage, ChatMessage } from "../types";
import { ChatHeader } from "./chat-header";
import { ConversationNavigator } from "./conversation-navigator";
import { MessageList } from "./message-list";

export function ChatPage({ chatId }: { chatId: string }) {
  const view = useMemo(() => chatMockAdapter.get(chatId), [chatId]);
  const [messages, setMessages] = useState<ChatMessage[]>(view.chat.messages);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [activeSection, setActiveSection] = useState(() => view.chat.messages.find((message) => message.role === "user")?.id);
  const sections = useRef(new Map<string, HTMLElement>());
  const resources = useMemo(() => [...view.datasets, ...view.artifacts], [view.artifacts, view.datasets]);

  function updateMessages(next: ChatMessage[]) {
    setMessages(next);
    chatMockAdapter.save({ ...view.chat, messages: next });
  }

  function selectFile(file: ContextFile | null) {
    setSelectedFile(file);
    setPanelOpen(true);
  }

  function selectFileById(id: string) {
    const file = resources.find((resource) => resource.id === id);
    if (file) selectFile(file);
  }

  function togglePanel() {
    setPanelOpen((open) => {
      if (open) setSelectedFile(null);
      return !open;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    const stamp = new Date().toISOString();
    const token = `${Date.now()}-${messages.length}`;
    const next: ChatMessage[] = [
      ...messages,
      { id: `question-${token}`, role: "user", content, createdAt: stamp },
      { id: `answer-${token}`, role: "assistant", status: "completed", createdAt: stamp, blocks: [{ type: "markdown", content: mockResponseText }] },
    ];
    updateMessages(next);
    setDraft("");
  }

  function retry(message: AssistantMessage) {
    const stamp = new Date().toISOString();
    updateMessages([...messages, { ...message, id: `${message.id}-retry-${Date.now()}`, createdAt: stamp, status: "completed", retryOf: message.id }]);
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
          title={view.chat.title}
          workspaceName={view.chat.workspace?.name}
          panelOpen={panelOpen}
          onToggleRightPanel={togglePanel}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageList
            messages={messages}
            onRetry={retry}
            onFileSelect={selectFileById}
            registerSection={(id, node) => {
              if (node) sections.current.set(id, node);
              else sections.current.delete(id);
            }}
          />
        </div>
        <form className="shrink-0 border-t bg-background p-3 sm:p-4" onSubmit={submit}>
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-border-strong bg-surface p-2 focus-within:border-ring">
            <button type="button" aria-label="Add attachment (demo unavailable)" disabled className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-50"><Plus className="size-4" /></button>
            <label htmlFor="chat-message" className="sr-only">Ask anything about your data</label>
            <textarea
              id="chat-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Ask anything about your data…"
              className="max-h-32 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-30"><ArrowUp className="size-4" /></button>
          </div>
        </form>
      </div>

      {panelOpen ? (
        <div className="absolute inset-y-0 right-0 z-40 w-full bg-sidebar shadow-2xl sm:max-w-[360px] xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shrink-0 xl:shadow-none">
          <ContextSidebar
            chatId={view.chat.id}
            workspaceId={view.chat.workspace?.id ?? null}
            datasets={view.datasets}
            artifacts={view.artifacts}
            selectedFile={selectedFile}
            onClose={() => {
              setSelectedFile(null);
              setPanelOpen(false);
            }}
            onFileSelect={selectFile}
          />
        </div>
      ) : null}
    </section>
  );
}
