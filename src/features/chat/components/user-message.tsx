import { Database, FileText } from "lucide-react";
import type { UserMessage as UserMessageType } from "../types";
import type { ContextFile } from "@/features/context-sidebar";
import { LibraryButton } from "./library-button";

export function UserMessage({ message, onFileSelect, resources, onLibraryToggle }: { message: UserMessageType; onFileSelect?: (id: string) => void; resources?: Map<string, ContextFile>; onLibraryToggle?: (file: ContextFile) => Promise<void> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div className="rounded-2xl rounded-br-sm border border-white/20 bg-primary px-4 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-sm">
          {message.content}
        </div>
        {!!message.databases?.length && <div aria-label="PostgreSQL sources" className="mt-2 flex flex-wrap justify-end gap-2">
          {message.databases.map((database) => <span key={database.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-[11px]">
            <Database aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{database.name}</span>
          </span>)}
        </div>}
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
        <time dateTime={message.createdAt} className="mt-1.5 block text-right text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
      </div>
    </div>
  );
}
