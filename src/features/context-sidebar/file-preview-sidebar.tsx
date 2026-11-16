"use client";

import { ArrowLeft, Download, FileText, Maximize2, Minimize2, PencilLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadResource } from "@/lib/api";
import { CsvSheetEditor } from "./csv-sheet-editor";
import { DatasetPreview } from "./dataset-preview";
import { ImagePreview } from "./image-preview";
import { PDFPreview } from "./pdf-preview";
import { TextPreview } from "./text-preview";
import { formatBytes } from "./resource-utils";
import { isDatasetResource, type ContextFile } from "./types";

interface FilePreviewSidebarProps {
  file: ContextFile;
  onBack: () => void;
  onClose: () => void;
  chatId?: string;
  workspaceId?: string | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onResourceSaved?: () => void;
}

export function FilePreviewSidebar({ file, onBack, onClose, chatId, workspaceId, expanded = false, onToggleExpanded, onResourceSaved }: FilePreviewSidebarProps) {
  const dataset = isDatasetResource(file);
  const isCsv = dataset && (file.mime_type.includes("csv") || file.name.toLowerCase().endsWith(".csv"));
  const closeButton = useRef<HTMLButtonElement>(null);
  const [hasUnsavedCsvEdits, setHasUnsavedCsvEdits] = useState(false);
  const [csvEditMode, setCsvEditMode] = useState(false);
  const scopeId = dataset ? (file.scope_type === "chat" ? chatId : workspaceId ?? undefined) : undefined;

  const confirmAnd = useCallback((action: () => void) => {
    if (!hasUnsavedCsvEdits || window.confirm("Discard unsaved CSV edits?")) action();
  }, [hasUnsavedCsvEdits]);

  useEffect(() => {
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        confirmAnd(onClose);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmAnd, onClose]);

  useEffect(() => {
    setCsvEditMode(false);
    setHasUnsavedCsvEdits(false);
  }, [file.id]);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      className="flex h-full min-h-0 w-full flex-col border-l bg-sidebar text-sidebar-foreground"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <button type="button" onClick={() => confirmAnd(onBack)} aria-label="Back to context" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ArrowLeft className="size-4" />
          <span>Back</span>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-xs font-medium text-foreground" title={file.name}>{file.name}</h1>
        {onToggleExpanded ? <button type="button" onClick={onToggleExpanded} aria-label={expanded ? "Restore preview" : "Expand preview"} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button> : null}
        <button ref={closeButton} type="button" onClick={() => confirmAnd(onClose)} aria-label="Close preview" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isCsv && csvEditMode ? <CsvSheetEditor file={file} scopeId={scopeId} onDirtyChange={setHasUnsavedCsvEdits} onSaved={() => onResourceSaved?.()} /> : dataset ? <div className="flex h-full min-h-0 flex-col">{isCsv && scopeId ? <div className="mb-3 flex shrink-0 justify-end"><button type="button" onClick={() => setCsvEditMode(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-3 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"><PencilLine className="size-3.5" />Edit spreadsheet</button></div> : null}<DatasetPreview dataset={file} /></div> : file.kind === "image" || file.kind === "chart" ? <ImagePreview artifact={file} /> : file.kind === "pdf" ? <PDFPreview artifact={file} /> : file.kind === "code" || file.kind === "document" ? <TextPreview artifact={file} /> : (
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
        <button type="button" onClick={() => void downloadResource(file.download_url, file.name)} className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Download className="size-3.5" /> Download
        </button>
        <button type="button" onClick={() => confirmAnd(onBack)} className="h-8 rounded-md border bg-surface px-3 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground">Return to context</button>
      </footer>
    </section>
  );
}
