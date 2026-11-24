"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, FileSpreadsheet, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DatasetLite } from "../types";
import { AddDatasetMenu } from "./add-dataset-menu";

interface DatasetsPanelProps {
  /** Datasets attached to this dashboard (used by a widget or added for the AI to use). */
  attached: DatasetLite[];
  /** Everything in the Library, for "Add from Library". */
  library: DatasetLite[];
  /** How many widgets read each dataset id. */
  usage: Record<string, number>;
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  onUploaded: () => void;
  onDrive: () => void;
  /** Published view: the list only, no adding or removing. */
  readOnly?: boolean;
}

/** The data this dashboard uses, with the same "Add dataset" menu as chat and the Library. */
export function DatasetsPanel({ attached, library, usage, onAttach, onDetach, onUploaded, onDrive, readOnly = false }: DatasetsPanelProps) {
  const [open, setOpen] = useState(true);
  const available = library.filter((dataset) => !attached.some((item) => item.id === dataset.id));
  return (
    <section aria-label="Datasets" className="border-b">
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex h-10 items-center pr-3">
          <Collapsible.Trigger className="flex h-10 min-w-0 flex-1 items-center gap-2 px-4 text-left text-xs font-medium text-foreground hover:bg-raised/60">
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <span>Datasets used</span>
            <span className="ml-auto text-[11px] font-normal tabular-nums text-muted-foreground">{attached.length}</span>
          </Collapsible.Trigger>
          {readOnly ? null : <AddDatasetMenu onUploaded={onUploaded} onDrive={onDrive} />}
        </div>
        <Collapsible.Content>
          {attached.length ? (
            <ul aria-label="Datasets used by this dashboard" className="pb-2">
              {attached.map((dataset) => {
                const count = usage[dataset.id] ?? 0;
                return (
                  <li key={dataset.id}>
                    <div className="group flex w-full items-center gap-2.5 px-4 py-2 hover:bg-raised/70">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface">
                        <FileSpreadsheet className="size-3.5 text-sage" strokeWidth={1.6} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground" title={dataset.name}>{dataset.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows · {dataset.columns.length} columns · {count ? `used by ${count} widget${count === 1 ? "" : "s"}` : "not used yet"}</span>
                      </span>
                      {count === 0 && !readOnly ? <button type="button" aria-label={`Remove ${dataset.name}`} title="Remove from this dashboard" onClick={() => onDetach(dataset.id)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"><X className="size-4" /></button> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="px-9 pb-3 text-[11px] text-muted-foreground">{readOnly ? "No datasets." : "No datasets yet. Add one, then ask the AI to build with it."}</p>}
          {available.length && !readOnly ? (
            <label className="mx-4 mb-3 block">
              <span className="sr-only">Add from Library</span>
              <select aria-label="Add from Library" value="" onChange={(event) => { if (event.target.value) onAttach(event.target.value); }} className="h-8 w-full rounded-md border bg-surface px-2 text-xs text-muted-foreground outline-none focus:border-border-strong">
                <option value="">Add from Library…</option>
                {available.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
              </select>
            </label>
          ) : null}
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  );
}
