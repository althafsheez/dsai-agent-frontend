import { FileText } from "lucide-react";
import type { UserMessage as UserMessageType } from "../types";

export function UserMessage({ message }: { message: UserMessageType }) {
  return <div className="flex justify-end">
    <div className="max-w-[86%] sm:max-w-[76%]">
      <div className="rounded-xl rounded-br-sm border border-border-strong bg-raised px-4 py-3 text-[13px] leading-6">{message.content}</div>
      {message.attachments?.length ? <div className="mt-2 flex flex-wrap justify-end gap-2">{message.attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-2 rounded-md border bg-surface px-2.5 py-2 text-[11px]"><FileText className="size-3.5 text-muted-foreground" /><span>{attachment.name}</span><span className="text-muted-foreground">{attachment.size}</span></div>)}</div> : null}
      <time dateTime={message.createdAt} className="mt-1.5 block text-right text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </div>
  </div>;
}
