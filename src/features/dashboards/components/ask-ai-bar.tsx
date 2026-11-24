"use client";

import { useState } from "react";
import { ArrowUp, LoaderCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskAiBarProps {
  placeholder: string;
  busy: boolean;
  disabled?: boolean;
  error?: string | null;
  suggestions: string[];
  /** Resolves when the change was applied; the text is cleared then. */
  onSubmit: (text: string) => Promise<void>;
  label?: string;
  rows?: number;
}

/** One prompt box for building and for changing a dashboard, with follow-up ideas underneath (Zoho "Ask Zia" style). */
export function AskAiBar({ placeholder, busy, disabled, error, suggestions, onSubmit, label = "Ask AI", rows = 1 }: AskAiBarProps) {
  const [text, setText] = useState("");
  const blocked = disabled || busy;
  async function send(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 3 || blocked) return;
    try { await onSubmit(trimmed); setText(""); } catch { /* the caller shows the error */ }
  }
  return (
    <div className="rounded-xl border bg-surface/40 p-3">
      <div className="flex items-end gap-2">
        <Sparkles className="mb-2.5 size-4 shrink-0 text-sage" aria-hidden="true" />
        <textarea
          aria-label={label}
          value={text}
          rows={rows}
          disabled={blocked}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(text); } }}
          className="max-h-40 min-h-9 w-full resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button type="button" aria-label="Send to AI" onClick={() => void send(text)} disabled={blocked || text.trim().length < 3} className="mb-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-40">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
      {suggestions.length ? (
        <ul className={cn("mt-2 flex flex-wrap gap-1.5 pl-6", blocked && "pointer-events-none opacity-50")} aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}><button type="button" onClick={() => void send(suggestion)} className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">{suggestion}</button></li>
          ))}
        </ul>
      ) : null}
      {busy ? <p role="status" className="mt-2 pl-6 text-[11px] text-muted-foreground">Working on it…</p> : null}
      {error ? <p role="alert" className="mt-2 pl-6 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
