"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";
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
}

interface DatasetGroupProps {
  label: string;
  datasets: DatasetResource[];
  onFileSelect: (dataset: DatasetResource) => void;
  onLibraryToggle?: (dataset: DatasetResource) => void;
}

function DatasetGroup({ label, datasets, onFileSelect, onLibraryToggle }: DatasetGroupProps) {
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
            {datasets.map((dataset) => (
              <li key={dataset.id}>
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
                  <button type="button" onClick={() => onLibraryToggle?.(dataset)} aria-pressed={dataset.in_library ?? false} className="rounded-md border px-2 py-1 text-[10px] text-muted-foreground hover:border-border-strong hover:text-foreground">
                    {dataset.in_library ? "In Library" : "Add to Library"}
                  </button>
                  <button type="button" onClick={() => void downloadResource(dataset.download_url, dataset.name)} aria-label={`Download ${dataset.name}`} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"><Download className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-9 pb-3 text-[11px] text-muted-foreground">No datasets in this scope.</p>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function DatasetsPanel({ datasets, onFileSelect, onLibraryToggle }: DatasetsPanelProps) {
  const inputDatasets = datasets.filter((dataset) => (dataset.source ?? (dataset.origin === "generated" ? "output" : "input")) === "input");
  const outputDatasets = datasets.filter((dataset) => (dataset.source ?? (dataset.origin === "generated" ? "output" : "input")) === "output");

  return (
    <div id="datasets-panel" role="tabpanel" aria-label="Datasets" className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <DatasetGroup label="Input" datasets={inputDatasets} onFileSelect={onFileSelect} onLibraryToggle={onLibraryToggle} />
      <DatasetGroup label="Output" datasets={outputDatasets} onFileSelect={onFileSelect} onLibraryToggle={onLibraryToggle} />
    </div>
  );
}
