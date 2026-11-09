import { Database, Download, FileText } from "lucide-react";
import type { MessageBlock } from "../types";

type FileData = Extract<MessageBlock, { type: "file" }>;

export function FileBlock({ name, kind, size, description }: Omit<FileData, "type" | "id">) {
  const Icon = kind === "Dataset" ? Database : FileText;
  return <div className="my-4 flex items-center gap-3 rounded-lg border bg-surface p-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-raised text-sage"><Icon className="size-4" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{description ?? kind} · {size}</span></span>
    <button className="rounded p-2 text-muted-foreground hover:bg-raised hover:text-foreground" aria-label={`Download ${name}`} title="Preview fixture — download unavailable"><Download className="size-4" /></button>
  </div>;
}
