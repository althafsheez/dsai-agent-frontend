import { Database, Download, FileText } from "lucide-react";
import type { MessageBlock } from "../types";

type FileData = Extract<MessageBlock, { type: "file" }>;

export function FileBlock({ id, name, kind, size, description, onPreview, onDownload }: Omit<FileData, "type"> & { onPreview?: (id: string) => void; onDownload?: (id: string) => void }) {
  const Icon = kind === "Dataset" ? Database : FileText;
  return <div className="my-4 flex items-center gap-3 rounded-lg border bg-surface p-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-raised text-sage"><Icon className="size-4" /></span>
    <button type="button" onClick={() => onPreview?.(id)} className="min-w-0 flex-1 text-left" aria-label={`Preview ${name}`}>
      <span className="block truncate text-xs font-medium">{name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{description ?? kind} · {size}</span>
    </button>
    {onPreview && <button type="button" onClick={() => onPreview(id)} className="rounded-md border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground">Preview</button>}
    <button type="button" onClick={() => onDownload?.(id)} disabled={!onDownload} className="rounded p-2 text-muted-foreground hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Download ${name}`}><Download className="size-4" /></button>
  </div>;
}
