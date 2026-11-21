"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { BookOpen, Check, ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { downloadResource } from "@/lib/api";
import { formatBytes, formatCount } from "./resource-utils";
import type { DatasetResource } from "./types";

interface DatasetsPanelProps {
  datasets: DatasetResource[];
  workspaceId: string | null;
  onFileSelect: (dataset: DatasetResource) => void;
  onLibraryToggle?: (dataset: DatasetResource) => void;
  searchQuery?: string;
}

interface DatasetGroupProps {
  label: string;
  datasets: DatasetResource[];
  onFileSelect: (dataset: DatasetResource) => void;
  onLibraryToggle?: (dataset: DatasetResource) => void;
  searchQuery?: string;
}

function DatasetGroup({ label, datasets, onFileSelect, onLibraryToggle, searchQuery }: DatasetGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <Collapsible.Trigger className="flex h-10 w-full items-center gap-2 px-4 text-left text-xs font-medium text-foreground hover:bg-raised/60">
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span>{label}</span>
        <span className="ml-auto text-[11px] font-normal tabular-nums text-muted-foreground">{datasets.length}</span>
      </Collapsible.Trigger>
      <Collapsible.Content>
        {datasets.length ? (
          <ul className="pb-2">
            {datasets.map((dataset) => {
              const saved = dataset.in_library ?? dataset.saved ?? false;
              return <li key={dataset.id}>
                <div className="group flex w-full items-center gap-2.5 px-4 py-2 hover:bg-raised/70">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onFileSelect(dataset)}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface">
                    <FileSpreadsheet className="size-3.5 text-sage" strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{dataset.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {dataset.row_count === null ? formatBytes(dataset.size_bytes) : `${formatCount(dataset.row_count, "row")} · ${formatBytes(dataset.size_bytes)}`}
                    </span>
                  </span>
                  </button>
                  <button type="button" onClick={() => onLibraryToggle?.(dataset)} aria-label={saved ? `Saved in Library: ${dataset.name}` : `Add ${dataset.name} to Library`} aria-pressed={saved} className="group/library relative grid size-8 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground">
                    <BookOpen className="size-4" />
                    {saved ? <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border border-sidebar bg-sage text-sidebar"><Check className="size-2.5 stroke-[3]" /></span> : null}
                    <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover/library:opacity-100 after:absolute after:right-2.5 after:top-full after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-border-strong">{saved ? "Saved to Library" : "Add to Library"}</span>
                  </button>
                  <button type="button" onClick={() => void downloadResource(dataset.download_url, dataset.name)} aria-label={`Download ${dataset.name}`} className="group/download relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"><Download className="size-4" /><span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover/download:opacity-100 after:absolute after:right-2.5 after:top-full after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-border-strong">Download</span></button>
                </div>
              </li>;
            })}
          </ul>
        ) : (
          <p className="px-9 pb-3 text-[11px] text-muted-foreground">
            {searchQuery ? "No matching datasets in this section." : "No datasets in this scope."}
          </p>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function DatasetsPanel({ datasets, onFileSelect, onLibraryToggle, searchQuery }: DatasetsPanelProps) {
  const inputDatasets = datasets.filter((dataset) => (dataset.source ?? (dataset.origin === "generated" ? "output" : "input")) === "input");
  const outputDatasets = datasets.filter((dataset) => (dataset.source ?? (dataset.origin === "generated" ? "output" : "input")) === "output");

  return (
    <div id="datasets-panel" role="tabpanel" aria-label="Datasets" className="h-full min-h-0 overflow-y-auto overscroll-contain">
      {searchQuery && datasets.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          No datasets matching &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <>
          <DatasetGroup label="Input" datasets={inputDatasets} onFileSelect={onFileSelect} onLibraryToggle={onLibraryToggle} searchQuery={searchQuery} />
          <DatasetGroup label="Output" datasets={outputDatasets} onFileSelect={onFileSelect} onLibraryToggle={onLibraryToggle} searchQuery={searchQuery} />
        </>
      )}
    </div>
  );
}
