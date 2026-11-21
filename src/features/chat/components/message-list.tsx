"use client";

import { memo, useMemo } from "react";
import type { AgentRunDto } from "@/lib/api";
import type { AssistantMessage as AssistantMessageType, ChatMessage } from "../types";
import { AssistantMessage } from "./assistant-message";
import type { DataReferenceResource } from "./data-reference";
import type { ContextFile } from "@/features/context-sidebar";
import { UserMessage } from "./user-message";

export const MessageList = memo(function MessageList({ messages, runs, onRetry, onFileSelect, onFileDownload, registerSection, resources, onLibraryToggle }: { messages: ChatMessage[]; runs?: AgentRunDto[]; onRetry?: (message: AssistantMessageType) => void; onFileSelect: (id: string) => void; onFileDownload?: (id: string) => void; registerSection: (id: string, node: HTMLElement | null) => void; resources?: Map<string, ContextFile>; onLibraryToggle?: (file: ContextFile) => Promise<void> }) {
  // Server refreshes and live SSE can race. Render each message identity once so a
  // transient duplicate never makes React reuse or omit a chat row.
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
  }, [messages]);
  return <div className="mx-auto w-full max-w-4xl space-y-10 px-5 py-10 sm:px-8 sm:py-14">
    {uniqueMessages.map((message) => <article key={message.id} id={`message-${message.id}`} ref={message.role === "user" ? (node) => registerSection(message.id, node) : undefined} className="scroll-mt-20">
      {message.role === "user" ? <UserMessage message={message} onFileSelect={onFileSelect} resources={resources} onLibraryToggle={onLibraryToggle} /> : <AssistantMessage message={message} run={runs?.find((run) => run.assistant_message_id === message.id)} onRetry={onRetry} onFileSelect={onFileSelect} onFileDownload={onFileDownload} resources={resources} onLibraryToggle={onLibraryToggle} />}
    </article>)}
  </div>;
});
