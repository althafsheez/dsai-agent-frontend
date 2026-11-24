"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, HardDrive, Link2, Paperclip, Plus } from "lucide-react";
import { uploadResource } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "Add dataset": Local storage, or Connectors then Google Drive. Same menu as the Library and workspace pages. */
export function AddDatasetMenu({ onUploaded, onDrive }: { onUploaded: () => void; onDrive: () => void }) {
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (files: File[]) => { for (const file of files) await uploadResource({ file, scopeType: "library", scopeId: "library", clientUploadId: crypto.randomUUID() }); },
    onSuccess: onUploaded,
  });
  return (
    <div className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} disabled={upload.isPending} onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs font-medium transition-colors hover:border-border-strong disabled:opacity-60">
        <Plus className="size-3.5" />{upload.isPending ? "Uploading…" : "Add dataset"}
      </button>
      <input ref={input} type="file" multiple accept=".csv,.tsv,.xlsx,.xls" className="sr-only" tabIndex={-1} aria-label="Choose dataset files" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) upload.mutate(files); event.currentTarget.value = ""; }} />
      {open ? (
        <div role="menu" onMouseDown={(event) => event.preventDefault()} className="absolute right-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] animate-pop-in overflow-hidden rounded-xl border border-border-strong bg-sidebar p-1.5 shadow-2xl">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); input.current?.click(); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-raised">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#b8cef0] text-[#172033]"><Paperclip className="size-4" /></span>
            <span className="min-w-0"><span className="block text-xs font-semibold">Local storage</span><span className="block text-[10px] text-muted-foreground">Upload from your device</span></span>
          </button>
          <button type="button" role="menuitem" aria-expanded={connectors} onClick={() => setConnectors((value) => !value)} className="mt-0.5 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-raised">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#c2d9b8] text-[#172e18]"><Link2 className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Connectors</span><span className="block text-[10px] text-muted-foreground">Google Drive and other data sources</span></span>
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", connectors && "rotate-90")} />
          </button>
          {connectors ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onDrive(); }} className="mt-0.5 flex w-full items-center gap-3 rounded-lg py-2 pl-9 pr-2 text-left hover:bg-raised">
              <HardDrive className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-medium">Google Drive</span><span className="block truncate text-[10px] text-muted-foreground">Import files from your Google Drive</span></span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
