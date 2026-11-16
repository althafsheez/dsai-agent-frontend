"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AssistantMessage as AssistantMessageType, ChatMessage } from "../types";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

export function MessageList({ messages, onRetry, onFileSelect, onFileDownload, registerSection }: { messages: ChatMessage[]; onRetry?: (message: AssistantMessageType) => void; onFileSelect: (id: string) => void; onFileDownload?: (id: string) => void; registerSection: (id: string, node: HTMLElement | null) => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
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
  const runningContent = useMemo(() => {
    const running = uniqueMessages.find((message): message is AssistantMessageType => message.role === "assistant" && message.status === "running");
    return running?.blocks[0];
  }, [uniqueMessages]);
  useEffect(() => { if (runningContent) bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [runningContent]);
  return <div className="mx-auto w-full max-w-4xl space-y-10 px-5 py-10 sm:px-8 sm:py-14">
    {uniqueMessages.map((message) => <article key={message.id} id={`message-${message.id}`} ref={message.role === "user" ? (node) => registerSection(message.id, node) : undefined} className="scroll-mt-20">
      {message.role === "user" ? <UserMessage message={message} onFileSelect={onFileSelect} /> : <AssistantMessage message={message} onRetry={onRetry} onFileSelect={onFileSelect} onFileDownload={onFileDownload} />}
    </article>)}
    <div ref={bottomRef} />
  </div>;
}
