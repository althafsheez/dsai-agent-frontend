"use client";

import { ArrowUp, Expand, LoaderCircle, Maximize2, Minimize2, Minus, Plus, Shrink, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useFloatingFrame } from "./use-floating-frame";
import { deleteQuickAssistantThread, getModels, getQuickAssistantMessages, streamQuickAssistantMessage, type ExecutionEvent } from "@/lib/api";
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
  /** Width in px of the context/file panel open on the right; the popup stays clear of it. */
  rightInset?: number;
  /** Reports when the window docks into the left half of the chat area, so the page can make room. */
  onSplitChange?: (split: boolean) => void;
  /** Asked once as soon as the assistant is ready, e.g. from the `/btw` slash command. */
  autoAsk?: string;
  /** Selected chat text sent here from the right-click menu; it is quoted into the draft, not sent. */
  quote?: { text: string; nonce: number };
}
interface QuickMessage { id: string; role: "user" | "assistant"; content: string; status: string; }

// A draft this long reads better in the larger panel, so typing it expands the popup before sending.
const LONG_DRAFT_CHARS = 140;

function compactText(content: string) {
  return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-raised px-1 font-mono text-[11px]">{part.slice(1, -1)}</code> : part);
}

export function QuickAssistantPopup({ chatId, snapshotMessageId, minimized, onMinimize, onRestore, onClose, autoAsk, quote, rightInset = 0, onSplitChange }: QuickAssistantPopupProps) {
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
  const [tabs, setTabs] = useState<string[]>(["main"]);
  const [activeTab, setActiveTab] = useState("main");
  const minimizedRef = useRef(minimized);
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    void Promise.all([getQuickAssistantMessages("chat", chatId), getModels()]).then(([history, modelData]) => {
      if (!active) return;
      const threads = [...new Set(history.items.map((message) => message.thread_id))];
      if (!threads.length) threads.push("main");
      const first = threads[0];
      setTabs(threads);
      setActiveTab(first);
      setMessages(history.items.filter((message) => message.thread_id === first).map((message) => ({ id: message.id, role: message.role, content: message.content, status: message.status })));
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
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape already handled elsewhere (slash menu, dialogs) or typed in another field must not minimize this popup.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      const typingElsewhere = active instanceof HTMLElement && active.closest("input, textarea, select, [contenteditable=true]") && !popupRef.current?.contains(active);
      if (!typingElsewhere) onMinimize();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [minimized, onMinimize]);

  async function switchTab(threadId: string, isNew = false) {
    if (running || threadId === activeTab) return;
    setActiveTab(threadId);
    setError(null);
    setDraft("");
    if (isNew) { setMessages([]); return; }
    setLoadingHistory(true);
    try {
      const history = await getQuickAssistantMessages("chat", chatId, threadId);
      setMessages(history.items.map((message) => ({ id: message.id, role: message.role, content: message.content, status: message.status })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this conversation.");
    } finally {
      setLoadingHistory(false);
    }
  }

  function addTab() {
    if (running) return;
    const threadId = `tab-${crypto.randomUUID().slice(0, 8)}`;
    setTabs((current) => [...current, threadId]);
    void switchTab(threadId, true);
  }

  async function closeTab(threadId: string) {
    if (running) return;
    const remaining = tabs.filter((id) => id !== threadId);
    try { await deleteQuickAssistantThread("chat", chatId, threadId); } catch { /* unsaved tabs have nothing to delete */ }
    setTabs(remaining.length ? remaining : ["main"]);
    if (threadId !== activeTab) return;
    const next = remaining[0] ?? "main";
    setActiveTab("");
    if (remaining.length) await switchTab(next);
    else { setActiveTab("main"); setMessages([]); setDraft(""); setError(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(draft.trim());
  }

  const lastQuote = useRef<number | null>(null);
  useEffect(() => {
    if (!quote || lastQuote.current === quote.nonce) return;
    lastQuote.current = quote.nonce;
    const quoted = quote.text.split("\n").map((line) => `> ${line}`).join("\n");
    setDraft((current) => `${current ? `${current}\n\n` : ""}${quoted}\n\n`);
    inputRef.current?.focus();
  }, [quote]);

  const autoAsked = useRef(false);
  useEffect(() => {
    if (!autoAsk || autoAsked.current || !selectedModel || loadingHistory) return;
    autoAsked.current = true;
    void ask(autoAsk);
    // ask reads the latest state when called; it is not a trigger for re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk, selectedModel, loadingHistory]);

  async function ask(question: string) {
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
        thread_id: activeTab,
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
  const frame = useFloatingFrame({ ref: popupRef, rightInset, expanded });
  // Full screen docks this window into the left half of the chat area, between the top bar and the composer.
  const split = frame.fullscreen && frame.canSplit && !minimized;
  useEffect(() => {
    onSplitChange?.(split);
    return () => onSplitChange?.(false);
  }, [split, onSplitChange]);

  return (
    <>
    <section
      ref={popupRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-expanded={expanded}
      data-fullscreen={frame.fullscreen}
      aria-hidden={minimized || undefined}
      inert={minimized || undefined}
      style={split ? undefined : frame.style}
      className={`${split ? "relative col-start-1 row-span-2 row-start-2 flex min-h-0 min-w-[360px] flex-col overflow-hidden border-r border-border-strong bg-sidebar " : "absolute z-[70] flex origin-top-left animate-pop-in flex-col overflow-hidden rounded-xl border border-border-strong bg-sidebar shadow-2xl "}${frame.interacting ? "" : "transition-[left,top,width,height,opacity,transform,visibility] duration-300 ease-spring"} ${minimized ? "invisible translate-y-2 scale-95 opacity-0" : "visible opacity-100"}`}
    >
      <header {...frame.dragProps} className={`flex shrink-0 touch-none select-none items-center gap-2 border-b px-3 py-1.5 ${frame.fullscreen ? "" : "cursor-grab active:cursor-grabbing"}`}>
        <Sparkles className="size-4 shrink-0 text-sage" />
        <h2 id={titleId} title="Side questions about this chat so far. Not added to the main chat." className="sr-only">Quick Assistant</h2>
        <div role="tablist" aria-label="Quick Assistant conversations" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((threadId, index) => (
            <span key={threadId} className={`group flex shrink-0 items-center rounded-md transition-colors ${threadId === activeTab ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <button type="button" role="tab" aria-selected={threadId === activeTab} disabled={running && threadId !== activeTab} onClick={() => void switchTab(threadId)} className="rounded-md py-1 pl-2.5 pr-1 text-[11px] font-medium disabled:opacity-50">
                Chat {index + 1}
              </button>
              <button type="button" onClick={() => void closeTab(threadId)} disabled={running} aria-label={`Close Chat ${index + 1}`} title="Close this chat" className="mr-1 grid size-4 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-40">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={addTab} disabled={running} aria-label="New Quick Assistant conversation" title="New conversation" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-40">
            <Plus className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setExpandedOverride(!expanded); frame.resetSize(); }}
          aria-label={expanded ? "Shrink Quick Assistant" : "Expand Quick Assistant"}
          title={expanded ? "Shrink" : "Expand"}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={frame.toggleFullscreen}
          aria-label={frame.fullscreen ? "Exit full screen" : "Open Quick Assistant full screen"}
          title={frame.fullscreen ? "Close split view" : "Split screen"}
          aria-pressed={frame.fullscreen}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground"
        >
          {frame.fullscreen ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
        </button>
        <button type="button" onClick={onMinimize} aria-label="Minimize Quick Assistant" title="Minimize" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground">
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close Quick Assistant" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>
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
      {frame.fullscreen ? null : (
        <div
          {...frame.resizeProps}
          role="separator"
          aria-label="Resize Quick Assistant"
          className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none after:absolute after:bottom-1 after:right-1 after:size-2 after:rounded-br-sm after:border-b-2 after:border-r-2 after:border-muted-foreground/60"
        />
      )}
    </section>
    {minimized ? (
      <div style={{ left: frame.box.left, top: frame.box.top }} className="absolute z-[70] flex animate-pop-in items-center gap-1 rounded-full border border-border-strong bg-sidebar py-1 pl-1 pr-1.5 shadow-xl">
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
