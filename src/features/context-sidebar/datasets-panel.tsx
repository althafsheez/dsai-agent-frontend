"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes, formatCount } from "./resource-utils";
import type { DatasetResource } from "./types";

interface DatasetsPanelProps {
  datasets: DatasetResource[];
  workspaceId: string | null;
  onFileSelect: (dataset: DatasetResource) => void;
}

interface DatasetGroupProps {
  label: string;
  datasets: DatasetResource[];
  onFileSelect: (dataset: DatasetResource) => void;
}

function DatasetGroup({ label, datasets, onFileSelect }: DatasetGroupProps) {
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
                <button
                  type="button"
                  className="group flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-raised/70"
                  onClick={() => onFileSelect(dataset)}
                >
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

export function DatasetsPanel({ datasets, workspaceId, onFileSelect }: DatasetsPanelProps) {
  const workspaceDatasets = datasets.filter((dataset) => dataset.scope_type === "workspace");
  const chatDatasets = datasets.filter((dataset) => dataset.scope_type === "chat");

  return (
    <div id="datasets-panel" role="tabpanel" aria-label="Datasets" className="min-h-0 overflow-y-auto">
      {workspaceId ? <DatasetGroup label="Workspace Datasets" datasets={workspaceDatasets} onFileSelect={onFileSelect} /> : null}
      <DatasetGroup label="Chat Datasets" datasets={chatDatasets} onFileSelect={onFileSelect} />
    </div>
  );
}
