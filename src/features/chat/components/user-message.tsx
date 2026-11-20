import { FileText } from "lucide-react";
import type { UserMessage as UserMessageType } from "../types";

export function UserMessage({ message, onFileSelect }: { message: UserMessageType; onFileSelect?: (id: string) => void }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div className="rounded-2xl rounded-br-sm border border-white/20 bg-primary px-4 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-sm">
          {message.content}
        </div>
        {message.attachments?.length ? (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) => (
              <button
                type="button"
                onClick={() => onFileSelect?.(attachment.id)}
                key={attachment.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 text-[11px] text-foreground hover:border-border-strong hover:bg-surface transition-colors"
              >
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{attachment.name}</span>
                <span className="text-muted-foreground">{attachment.size}</span>
              </button>
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
