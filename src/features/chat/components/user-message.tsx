"use client";

import { useState } from "react";
import { FileText, Pencil } from "lucide-react";
import type { UserMessage as UserMessageType } from "../types";
import type { ContextFile } from "@/features/context-sidebar";
import { CopyButton } from "./copy-button";
import { LibraryButton } from "./library-button";

interface UserMessageProps {
  message: UserMessageType;
  onFileSelect?: (id: string) => void;
  resources?: Map<string, ContextFile>;
  onLibraryToggle?: (file: ContextFile) => Promise<void>;
  /** Absent while an answer is running or for unsaved messages: editing is hidden then. */
  onEdit?: (messageId: string, content: string) => Promise<void>;
}

function EditForm({ message, onEdit, onDone }: { message: UserMessageType; onEdit: (messageId: string, content: string) => Promise<void>; onDone: () => void }) {
  const [text, setText] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const changed = text.trim() !== message.content.trim();
  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onEdit(message.id, text);
      onDone();
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="rounded-2xl border border-border-strong bg-surface px-2.5 pb-1.5 pt-2.5">
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save(); }
        }}
        aria-label="Edit your question"
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button type="submit" disabled={!text.trim() || !changed || saving} className="h-7 rounded-md bg-foreground px-3 text-xs text-background hover:opacity-90 disabled:opacity-40">{saving ? "Saving…" : "Save & retry"}</button>
      </div>
    </form>
  );
}

export function UserMessage({ message, onFileSelect, resources, onLibraryToggle, onEdit }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex justify-end">
      <div className={editing ? "w-full max-w-[88%] sm:max-w-[78%]" : "max-w-[88%] sm:max-w-[78%]"}>
        {editing && onEdit ? <EditForm message={message} onEdit={onEdit} onDone={() => setEditing(false)} /> : (
          <div className="rounded-2xl rounded-br-sm border border-white/20 bg-primary px-4 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-sm">
            {message.content}
          </div>
        )}
        {message.attachments?.length ? (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center rounded-lg border border-border bg-surface/90">
              <button
                type="button"
                onClick={() => onFileSelect?.(attachment.id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface transition-colors"
              >
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{attachment.name}</span>
                <span className="text-muted-foreground">{attachment.size}</span>
              </button>
              <LibraryButton file={resources?.get(attachment.id)} onToggle={onLibraryToggle} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-1.5 flex items-center justify-end gap-3 text-[10px] text-muted-foreground">
          {!editing ? <CopyButton label="Copy question" getText={() => message.content} /> : null}
          {onEdit && !editing ? (
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit question" className="inline-flex items-center gap-1 hover:text-foreground">
              <Pencil className="size-3" />Edit
            </button>
          ) : null}
          <time dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
      </div>
    </div>
  );
}
