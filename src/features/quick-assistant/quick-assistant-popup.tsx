"use client";

import { ArrowUp, Database, FileText, LoaderCircle, Maximize2, Minimize2, Minus, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { getModels, getQuickAssistantMessages, streamQuickAssistantMessage, type ExecutionEvent } from "@/lib/api";
import type { ContextFile } from "@/features/context-sidebar";

interface QuickAssistantPopupProps {
  chatId: string;
  /** Last main-chat message visible when the popup opened; later messages stay hidden from the assistant. */
  snapshotMessageId: string | null;
  resources: ContextFile[];
  onFileSelect: (file: ContextFile) => void;
  /** Minimized keeps this component mounted, so the conversation, draft and any running answer survive. */
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}
interface QuickMessage { id: string; role: "user" | "assistant"; content: string; status: string; }

// A draft this long reads better in the larger panel, so typing it expands the popup before sending.
const LONG_DRAFT_CHARS = 140;

function compactText(content: string) {
  return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-raised px-1 font-mono text-[11px]">{part.slice(1, -1)}</code> : part);
}

export function QuickAssistantPopup({ chatId, snapshotMessageId, resources, onFileSelect, minimized, onMinimize, onRestore, onClose }: QuickAssistantPopupProps) {
  const inputId = useId();
  const titleId = useId();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // null follows the automatic rule (expand once a question is sent or the draft gets long); a boolean is the user's own choice.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const [sentThisSession, setSentThisSession] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ id: string; default_effort: string | null } | null>(null);
  const [unseenAnswer, setUnseenAnswer] = useState(false);
  const minimizedRef = useRef(minimized);
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    void Promise.all([getQuickAssistantMessages("chat", chatId), getModels()]).then(([history, modelData]) => {
      if (!active) return;
      setMessages(history.items.map((message) => ({ id: message.id, role: message.role, content: message.content, status: message.status })));
      const models = modelData.models;
      setSelectedModel(models.find((model) => model.id === modelData.default_model_id) ?? models[0] ?? null);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Quick Assistant is unavailable."); }).finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [chatId]);
  useEffect(() => () => controller.current?.abort(), []);
  // The textarea stays disabled until a model loads, so focus once it is enabled; otherwise keys reach the header toggle.
  const inputReady = selectedModel !== null && !running && !minimized;
  useEffect(() => { if (inputReady) inputRef.current?.focus(); }, [inputReady]);
  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);
  useEffect(() => {
    minimizedRef.current = minimized;
    if (!minimized) setUnseenAnswer(false);
  }, [minimized]);
  useEffect(() => {
    if (minimized) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onMinimize(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [minimized, onMinimize]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || !selectedModel || running) return;
    const requestId = crypto.randomUUID();
    const temporaryAssistantId = `quick-pending-${requestId}`;
    setMessages((current) => [...current, { id: `quick-user-${requestId}`, role: "user", content: question, status: "completed" }, { id: temporaryAssistantId, role: "assistant", content: "", status: "running" }]);
    setDraft(""); setError(null); setRunning(true); setSentThisSession(true);
    const activeController = new AbortController(); controller.current = activeController;
    let assistantId = temporaryAssistantId;
    try {
      await streamQuickAssistantMessage({
        context_type: "chat",
        context_id: chatId,
        content: question,
        model_id: selectedModel.id,
        effort: selectedModel.default_effort ?? undefined,
        client_request_id: requestId,
        context_until_message_id: snapshotMessageId ?? undefined,
      }, (event: ExecutionEvent) => {
        const messageId = typeof event.data.message_id === "string" ? event.data.message_id : null;
        if (event.type === "message.created" && messageId) { assistantId = messageId; setMessages((current) => current.map((message) => message.id === temporaryAssistantId ? { ...message, id: messageId } : message)); }
        if (event.type === "message.delta") { const text = typeof event.data.text === "string" ? event.data.text : ""; if (text) setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + text } : message)); }
        if (event.type === "message.completed") { const content = typeof event.data.content === "string" ? event.data.content : ""; setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content, status: "completed" } : message)); if (minimizedRef.current) setUnseenAnswer(true); }
        if (event.type === "agent.failed") { const failure = event.data.error; const detail = failure && typeof failure === "object" && "message" in failure ? String((failure as { message: unknown }).message) : "Quick Assistant could not answer that."; setError(detail); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "failed" } : message)); }
      }, activeController.signal);
    } catch (caught) {
      if (!activeController.signal.aborted) { setError(caught instanceof Error ? caught.message : "Quick Assistant could not answer that."); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "failed" } : message)); }
    } finally {
      if (controller.current === activeController) controller.current = null;
      setRunning(false);
    }
  }

  const expanded = expandedOverride ?? (sentThisSession || draft.length > LONG_DRAFT_CHARS || draft.includes("\n"));

  return (
    <>
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-expanded={expanded}
      aria-hidden={minimized || undefined}
      inert={minimized || undefined}
      className={`fixed right-4 top-16 z-[70] flex origin-top-right animate-pop-in flex-col overflow-hidden rounded-xl border border-border-strong bg-sidebar shadow-2xl transition-[width,height,opacity,transform,visibility] duration-300 ease-spring ${expanded ? "h-[min(640px,calc(100dvh-6rem))] w-[min(560px,calc(100vw-2rem))]" : "h-[min(440px,calc(100dvh-6rem))] w-[min(360px,calc(100vw-2rem))]"} ${minimized ? "invisible translate-y-2 scale-95 opacity-0" : "visible opacity-100"}`}
    >
      <header className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-sage" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-sm font-medium text-foreground">Quick Assistant</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Side questions about this chat so far. Not added to the main chat.</p>
        </div>
        <button
          type="button"
          onClick={() => setExpandedOverride(!expanded)}
          aria-label={expanded ? "Shrink Quick Assistant" : "Expand Quick Assistant"}
          title={expanded ? "Shrink" : "Expand"}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button type="button" onClick={onMinimize} aria-label="Minimize Quick Assistant" title="Minimize" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground">
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close Quick Assistant" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>
      {resources.length ? (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-2 [scrollbar-width:none]" aria-label="Available context files">
          {resources.slice(0, 4).map((resource) => (
            <button key={resource.id} type="button" onClick={() => onFileSelect(resource)} className="inline-flex max-w-36 shrink-0 items-center gap-1 rounded border bg-surface px-1.5 py-1 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground" title={`Open ${resource.name}`}>
              {"scope_type" in resource ? <Database className="size-3 text-sage" /> : <FileText className="size-3 text-slate" />}
              <span className="truncate">{resource.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {loadingHistory ? <p className="text-[13px] text-muted-foreground">Loading saved questions…</p> : null}
        {!loadingHistory && messages.length === 0 ? <p className="text-[13px] text-muted-foreground">Ask a quick question about this analysis, dataset, or artifact.</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-8 rounded-lg border border-border-strong bg-raised px-3 py-2 text-[13px] leading-5 text-foreground" : "mr-2 whitespace-pre-wrap text-[13px] leading-5 text-sidebar-foreground"}>
            {message.content ? compactText(message.content) : message.status === "running" ? <LoaderCircle className="size-4 animate-spin text-sage" aria-label="Quick Assistant is responding" /> : message.status === "failed" ? <span className="text-red-300">Couldn’t complete this answer.</span> : null}
          </div>
        ))}
        {error ? <p role="alert" className="text-xs leading-4 text-red-300">{error}</p> : null}
      </div>
      <form className="m-3 mt-0 flex shrink-0 items-end gap-2 rounded-lg border bg-surface p-1.5 focus-within:border-border-strong" onSubmit={submit}>
        <label htmlFor={inputId} className="sr-only">Ask Quick Assistant</label>
        <textarea
          ref={inputRef}
          id={inputId}
          rows={expanded ? 2 : 1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={selectedModel ? "Ask a side question…" : "Assistant unavailable"}
          disabled={!selectedModel || running}
          className={`${expanded ? "max-h-40" : "max-h-24"} min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed`}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
        />
        <button type="submit" disabled={!draft.trim() || !selectedModel || running} aria-label="Send to Quick Assistant" className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </section>
    {minimized ? (
      <div className="fixed right-4 top-16 z-[70] flex animate-pop-in items-center gap-1 rounded-full border border-border-strong bg-sidebar py-1 pl-1 pr-1.5 shadow-xl">
        <button type="button" onClick={onRestore} aria-label="Restore Quick Assistant" className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs text-foreground hover:bg-raised">
          {running ? <LoaderCircle className="size-3.5 animate-spin text-sage" /> : <Sparkles className="size-3.5 text-sage" />}
          Quick Assistant
          {unseenAnswer ? <span className="size-1.5 rounded-full bg-sage" aria-label="New answer" /> : null}
        </button>
        <button type="button" onClick={onClose} aria-label="Close minimized Quick Assistant" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-raised hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    ) : null}
    </>
  );
}
