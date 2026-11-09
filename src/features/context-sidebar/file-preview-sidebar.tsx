"use client";

import { ArrowLeft, Download, FileText, X } from "lucide-react";
import { DatasetPreview } from "./dataset-preview";
import { ImagePreview } from "./image-preview";
import { PDFPreview } from "./pdf-preview";
import { formatBytes } from "./resource-utils";
import { isDatasetResource, type ContextFile } from "./types";

interface FilePreviewSidebarProps {
  file: ContextFile;
  onBack: () => void;
  onClose: () => void;
}

export function FilePreviewSidebar({ file, onBack, onClose }: FilePreviewSidebarProps) {
  const dataset = isDatasetResource(file);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l bg-sidebar text-sidebar-foreground" aria-label={`Preview ${file.name}`}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <button type="button" onClick={onBack} aria-label="Back to context" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ArrowLeft className="size-4" />
          <span>Back</span>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-xs font-medium text-foreground" title={file.name}>{file.name}</h1>
        <button type="button" onClick={onClose} aria-label="Close preview" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {dataset ? <DatasetPreview dataset={file} /> : file.kind === "image" || file.kind === "chart" ? <ImagePreview artifact={file} /> : file.kind === "pdf" ? <PDFPreview artifact={file} /> : (
          <div className="grid min-h-52 place-items-center rounded-md border border-dashed px-6 text-center">
            <div>
              <FileText className="mx-auto mb-3 size-6 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-xs text-foreground">Browser preview is not available for this file.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{file.mime_type} · {formatBytes(file.size_bytes)}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 gap-2 border-t p-3">
        <a href={file.download_url} download className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Download className="size-3.5" /> Download
        </a>
        <button type="button" onClick={onBack} className="h-8 rounded-md border bg-surface px-3 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground">Return to context</button>
      </footer>
    </aside>
  );
}
