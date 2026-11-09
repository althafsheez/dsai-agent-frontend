"use client";

import { ArrowUp } from "lucide-react";
import { FormEvent, useId, useState } from "react";

interface QuickAssistantProps {
  chatId: string;
  workspaceId: string | null;
}

interface QuickMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function QuickAssistant({ chatId, workspaceId }: QuickAssistantProps) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<QuickMessage[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    const token = `${Date.now()}-${messages.length}`;
    setMessages((current) => [
      ...current,
      { id: `user-${token}`, role: "user", content: question },
      {
        id: `assistant-${token}`,
        role: "assistant",
        content: "This is a read-only demo response. I can explain the files in this context without changing the main analysis.",
      },
    ]);
    setDraft("");
  }

  return (
    <section className="flex min-h-[210px] flex-col border-t bg-sidebar" aria-labelledby="quick-assistant-title" data-chat-id={chatId} data-workspace-id={workspaceId ?? undefined}>
      <div className="px-4 pb-2 pt-3">
        <h2 id="quick-assistant-title" className="text-xs font-medium text-foreground">Quick Assistant</h2>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Read-only questions about this context.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2" aria-live="polite">
        {messages.length === 0 ? <p className="pt-2 text-xs text-muted-foreground">Ask about this analysis or its files.</p> : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-6 rounded-md bg-raised px-2.5 py-2 text-xs text-foreground" : "mr-3 text-xs leading-5 text-sidebar-foreground"}
          >
            {message.content}
          </div>
        ))}
      </div>
      <form className="m-3 flex items-end gap-2 rounded-lg border bg-surface p-1.5 focus-within:border-border-strong" onSubmit={submit}>
        <label htmlFor={inputId} className="sr-only">Ask Quick Assistant</label>
        <textarea
          id={inputId}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a question..."
          className="max-h-24 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send to Quick Assistant"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-3.5" />
        </button>
      </form>
    </section>
  );
}
