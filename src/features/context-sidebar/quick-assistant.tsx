"use client";

import { ArrowUp, Database, FileText, LoaderCircle, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { getModels, getQuickAssistantMessages, streamQuickAssistantMessage, type ExecutionEvent } from "@/lib/api";
import type { ContextFile } from "./types";

interface QuickAssistantProps { chatId: string; workspaceId: string | null; resources: ContextFile[]; onFileSelect: (file: ContextFile) => void; }
interface QuickMessage { id: string; role: "user" | "assistant"; content: string; status: string; }

function compactText(content: string) {
  return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-raised px-1 font-mono text-[10px]">{part.slice(1, -1)}</code> : part);
}

export function QuickAssistant({ chatId, workspaceId, resources, onFileSelect }: QuickAssistantProps) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedModel, setSelectedModel] = useState<{ id: string; default_effort: string | null } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const contextType = "chat" as const;
  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    void Promise.all([getQuickAssistantMessages(contextType, chatId), getModels()]).then(([history, modelData]) => {
      if (!active) return;
      setMessages(history.items.map((message) => ({ id: message.id, role: message.role, content: message.content, status: message.status })));
      const models = modelData.models;
      setSelectedModel(models.find((model) => model.id === modelData.default_model_id) ?? models[0] ?? null);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Quick Assistant is unavailable."); }).finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [chatId]);
  useEffect(() => () => controller.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || !selectedModel || running) return;
    const requestId = crypto.randomUUID();
    const temporaryAssistantId = `quick-pending-${requestId}`;
    setMessages((current) => [...current, { id: `quick-user-${requestId}`, role: "user", content: question, status: "completed" }, { id: temporaryAssistantId, role: "assistant", content: "", status: "running" }]);
    setDraft(""); setError(null); setRunning(true);
    const activeController = new AbortController(); controller.current = activeController;
    let assistantId = temporaryAssistantId;
    try {
      await streamQuickAssistantMessage({ context_type: contextType, context_id: chatId, content: question, model_id: selectedModel.id, effort: selectedModel.default_effort ?? undefined, client_request_id: requestId }, (event: ExecutionEvent) => {
        const messageId = typeof event.data.message_id === "string" ? event.data.message_id : null;
        if (event.type === "message.created" && messageId) { assistantId = messageId; setMessages((current) => current.map((message) => message.id === temporaryAssistantId ? { ...message, id: messageId } : message)); }
        if (event.type === "message.delta") { const text = typeof event.data.text === "string" ? event.data.text : ""; if (text) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + text } : message)); }
        if (event.type === "message.completed") { const content = typeof event.data.content === "string" ? event.data.content : ""; setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content, status: "completed" } : message)); }
        if (event.type === "agent.failed") { const failure = event.data.error; const detail = failure && typeof failure === "object" && "message" in failure ? String((failure as { message: unknown }).message) : "Quick Assistant could not answer that."; setError(detail); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "failed" } : message)); }
      }, activeController.signal);
    } catch (caught) {
      if (!activeController.signal.aborted) { setError(caught instanceof Error ? caught.message : "Quick Assistant could not answer that."); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "failed" } : message)); }
    } finally {
      if (controller.current === activeController) controller.current = null;
      setRunning(false);
    }
  }

  return <section className="flex min-h-[252px] max-h-[44%] shrink-0 flex-col border-t bg-sidebar" aria-labelledby="quick-assistant-title" data-chat-id={chatId} data-workspace-id={workspaceId ?? undefined}>
    <div className="flex items-start gap-2 px-4 pb-2 pt-3"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-sage" /><div><h2 id="quick-assistant-title" className="text-xs font-medium text-foreground">Quick Assistant</h2><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Separate, saved chat with this analysis context.</p></div></div>
    {resources.length ? <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2" aria-label="Available context files">{resources.slice(0, 4).map((resource) => <button key={resource.id} type="button" onClick={() => onFileSelect(resource)} className="inline-flex max-w-36 shrink-0 items-center gap-1 rounded border bg-surface px-1.5 py-1 text-[10px] text-muted-foreground hover:border-border-strong hover:text-foreground" title={`Open ${resource.name}`}>{"scope_type" in resource ? <Database className="size-3 text-sage" /> : <FileText className="size-3 text-slate" />}<span className="truncate">{resource.name}</span></button>)}</div> : null}
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2" aria-live="polite">{loadingHistory ? <p className="pt-2 text-xs text-muted-foreground">Loading saved questions…</p> : null}{!loadingHistory && messages.length === 0 ? <p className="pt-2 text-xs text-muted-foreground">Ask about this analysis, dataset, or artifact.</p> : null}{messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-6 rounded-lg border border-border-strong bg-raised px-2.5 py-2 text-xs leading-5 text-foreground" : "mr-2 text-xs leading-5 text-sidebar-foreground"}>{message.content ? compactText(message.content) : message.status === "running" ? <LoaderCircle className="size-3.5 animate-spin text-sage" aria-label="Quick Assistant is responding" /> : message.status === "failed" ? <span className="text-red-300">Couldn’t complete this answer.</span> : null}</div>)}{error ? <p role="alert" className="text-[11px] leading-4 text-red-300">{error}</p> : null}</div>
    <form className="m-3 flex items-end gap-2 rounded-lg border bg-surface p-1.5 focus-within:border-border-strong" onSubmit={submit}><label htmlFor={inputId} className="sr-only">Ask Quick Assistant</label><textarea id={inputId} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedModel ? "Ask a question…" : "Assistant unavailable"} disabled={!selectedModel || running} className="max-h-20 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" disabled={!draft.trim() || !selectedModel || running} aria-label="Send to Quick Assistant" className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-30"><ArrowUp className="size-3.5" /></button></form>
  </section>;
}
