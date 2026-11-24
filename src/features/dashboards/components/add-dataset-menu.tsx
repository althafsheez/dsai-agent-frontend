"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Paperclip, Plus, Search } from "lucide-react";
import { uploadResource } from "@/lib/api";
import { CONNECTOR_ITEMS, type ConnectorCategory } from "@/features/connectors/attach-catalog";

const CATEGORIES = [["all", "My Connections"], ["skills", "Skills"], ["data", "Data Sources"], ["apps", "Apps & Tools"]] as const;
const card = "flex min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-gradient-to-br from-[#29323e] to-[#20272f] p-2 text-left hover:border-slate/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring";

/** "Add dataset": the same "Add files and connectors" popover as the chat composer. */
export function AddDatasetMenu({ onUploaded, onDrive, onLibrary }: { onUploaded: () => void; onDrive: () => void; onLibrary?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConnectorCategory>("all");
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (files: File[]) => { for (const file of files) await uploadResource({ file, scopeType: "library", scopeId: "library", clientUploadId: crypto.randomUUID() }); },
    onSuccess: onUploaded,
  });
  const search = query.trim().toLowerCase();
  const showDrive = (category === "all" || category === "data") && "google drive".includes(search);
  const connectors = category === "all" ? [] : CONNECTOR_ITEMS.filter((item) => item.category === category && `${item.name} ${item.description}`.toLowerCase().includes(search));
  const close = () => setOpen(false);

  return (
    <div className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} disabled={upload.isPending} onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs font-medium transition-colors hover:border-border-strong disabled:opacity-60">
        <Plus className="size-3.5" />{upload.isPending ? "Uploading…" : "Add dataset"}
      </button>
      <input ref={input} type="file" multiple accept=".csv,.tsv,.xlsx,.xls,.parquet" className="sr-only" tabIndex={-1} aria-label="Choose dataset files" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) upload.mutate(files); event.currentTarget.value = ""; }} />
      {open ? (
        <div role="dialog" aria-label="Add files and connectors" onMouseDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}
          className="absolute right-0 top-full z-30 mt-2 flex h-[min(26rem,65dvh)] w-[min(21rem,calc(100vw-2rem))] animate-pop-in flex-col overflow-hidden rounded-xl border border-border-strong bg-[#191b1e] shadow-2xl">
          <div className="shrink-0 space-y-2 px-2.5 pt-2.5">
            <label className="relative block">
              <span className="sr-only">Find a connector, skill, or tool</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a connector, skill, or tool…" className="h-9 w-full rounded-lg border border-border-strong bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring" />
            </label>
            <div className={onLibrary ? "grid grid-cols-2 gap-2" : "grid grid-cols-1"}>
              <button type="button" onClick={() => { close(); input.current?.click(); }} className={card}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#b8cef0] text-[#172033]"><Paperclip aria-hidden="true" className="size-4" /></span>
                <span className="min-w-0"><span className="block text-xs font-semibold leading-4">Add files</span><span className="block text-[10px] leading-4 text-muted-foreground">From your device</span></span>
                <ChevronRight aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
              </button>
              {onLibrary ? (
                <button type="button" onClick={() => { close(); onLibrary(); }} className={card}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#c2d9b8] text-[#172e18]"><BookOpen aria-hidden="true" className="size-4" /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold leading-4">From Library</span><span className="block text-[10px] leading-4 text-muted-foreground">Saved datasets</span></span>
                  <ChevronRight aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
                </button>
              ) : null}
            </div>
            <div role="tablist" aria-label="Connector categories" className="flex flex-wrap gap-1 border-b pb-1.5">
              {CATEGORIES.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => setCategory(value)} className={`h-8 rounded-md px-2 text-[11px] ${category === value ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5">
            {showDrive ? (
              <button type="button" onClick={() => { close(); onDrive(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-raised">
                <Image src="/extension-logos/googledrive.svg" alt="" width={20} height={20} unoptimized /> Google Drive <span className="ml-auto text-muted-foreground">Import files</span>
              </button>
            ) : null}
            {connectors.map(({ name, description, icon: Icon, logo }) => (
              <div key={name} aria-disabled="true" className="flex items-center gap-3 border-b px-2 py-2 last:border-b-0">
                {logo ? <Image src={`/extension-logos/${logo}.svg`} alt="" width={20} height={20} unoptimized className="shrink-0" /> : <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{name}</span><span className="block truncate text-[11px] text-muted-foreground">{description}</span></span>
                <span className="shrink-0 rounded-full border bg-raised px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Soon</span>
              </div>
            ))}
            {!showDrive && !connectors.length ? <p className="px-3 py-4 text-xs text-muted-foreground">No matching connectors.</p> : null}
          </div>
          <div className="shrink-0 border-t px-2.5 py-2 text-[10px]">
            <button type="button" onClick={() => { close(); router.push("/extensions"); }} className="rounded-md px-1 py-1 text-muted-foreground hover:text-foreground">Manage connections in Extensions</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
