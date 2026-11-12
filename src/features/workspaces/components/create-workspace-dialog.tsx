"use client";

import { useRef, useState } from "react";
import { Database, FileSpreadsheet, Layers3, LoaderCircle, MoreHorizontal, Plus, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createWorkspace, type WorkspaceDto } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CreateWorkspaceDialogProps {
  onCreated: (workspace: WorkspaceDto) => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateWorkspaceDialog({ onCreated }: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setContext("");
    setFiles([]);
    setError(null);
    setDragging(false);
  }

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles?.length) return;
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...Array.from(nextFiles).filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !context.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await createWorkspace({ name: name.trim(), description: context.trim() });
      onCreated(workspace);
      setOpen(false);
      reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this workspace. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen && !submitting) reset(); }}>
    <DialogTrigger asChild><Button type="button"><Plus />New Workspace</Button></DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[600px] overflow-y-auto bg-[#111315] p-0">
      <form onSubmit={submit}>
        <div className="border-b px-6 py-5 sm:px-7">
          <DialogTitle className="text-xl font-semibold tracking-tight">Create Workspace</DialogTitle>
          <DialogDescription className="sr-only">Create a workspace with a name, optional local datasets, and AI context.</DialogDescription>
        </div>

        <div className="space-y-5 px-6 py-5 sm:px-7">
          <label className="block text-xs font-medium">
            Workspace name <span className="text-red-300">*</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="e.g. Revenue Intelligence" className="mt-2 h-10 w-full rounded-md border bg-surface px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-border-strong" />
          </label>

          <section aria-labelledby="workspace-datasets" className="rounded-xl border bg-background/25 p-3.5">
            <div className="mb-3 flex items-center gap-2.5">
              <Database className="size-5" strokeWidth={1.5} />
              <h2 id="workspace-datasets" className="text-sm font-medium">Datasets</h2>
              <span className="text-[10px] text-muted-foreground">Optional · uploads pending</span>
            </div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
              className={cn("flex min-h-24 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors hover:border-border-strong hover:bg-surface/50", dragging && "border-ring bg-surface/70")}
            >
              <UploadCloud className="mb-2 size-6 text-foreground" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">Drag & drop datasets here, or <span className="ml-1 inline-flex rounded-md bg-raised px-3 py-1.5 font-medium text-foreground">Browse files</span></span>
            </button>
            <input ref={fileInput} type="file" multiple accept=".csv,.xls,.xlsx,.parquet" className="sr-only" aria-label="Browse workspace datasets" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />

            {files.length > 0 && <div aria-label="Selected workspace datasets" className="mt-3 space-y-1.5">
              {files.map((file) => <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 rounded-md border bg-surface px-2.5 py-2 text-xs">
                <FileSpreadsheet className="size-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
              </div>)}
              <p className="text-[10px] leading-relaxed text-amber-200">These files remain in your browser and will not be uploaded in the current backend phase.</p>
            </div>}

            <div className="my-3 flex items-center gap-3 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or connect a source<span className="h-px flex-1 bg-border" /></div>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "CSV", icon: FileSpreadsheet, active: true },
                { label: "Excel", icon: FileSpreadsheet, active: true },
                { label: "Parquet", icon: Layers3, active: true },
                { label: "SQL", icon: Database, active: false },
                { label: "More", icon: MoreHorizontal, active: false },
              ].map(({ label, icon: Icon, active }) => <button key={label} type="button" disabled={!active} onClick={() => fileInput.current?.click()} className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-surface px-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors enabled:hover:border-border-strong enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"><Icon className="size-4" /><span className="truncate">{label}</span></button>)}
            </div>
          </section>

          <section aria-labelledby="workspace-context" className="rounded-xl border bg-background/25 p-3.5">
            <div className="mb-2.5 flex items-center gap-2.5"><Sparkles className="size-5" strokeWidth={1.5} /><h2 id="workspace-context" className="text-sm font-medium">AI Context <span className="text-red-300">*</span></h2></div>
            <label className="sr-only" htmlFor="workspace-ai-context">AI Context</label>
            <textarea id="workspace-ai-context" value={context} onChange={(event) => setContext(event.target.value)} maxLength={4000} rows={3} placeholder="Business goal, key context, KPIs, and rules..." className="w-full resize-y rounded-md border bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:border-border-strong" />
          </section>

          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4 sm:px-7">
          <DialogClose asChild><Button type="button" variant="outline" disabled={submitting}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={!name.trim() || !context.trim() || submitting}>{submitting ? <><LoaderCircle className="animate-spin" />Creating…</> : "Create Workspace"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
