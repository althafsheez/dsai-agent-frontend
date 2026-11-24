"use client";

import { Database, X } from "lucide-react";
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
}

/** The data this dashboard uses, with the same "Add dataset" menu as chat and the Library. */
export function DatasetsPanel({ attached, library, usage, onAttach, onDetach, onUploaded, onDrive }: DatasetsPanelProps) {
  const available = library.filter((dataset) => !attached.some((item) => item.id === dataset.id));
  return (
    <section aria-label="Datasets" className="rounded-xl border bg-surface/50">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Database className="size-4 shrink-0 text-sage" />
        <h2 className="min-w-0 flex-1 text-sm font-medium">Datasets <span className="text-[11px] font-normal text-muted-foreground">{attached.length} used</span></h2>
        <AddDatasetMenu onUploaded={onUploaded} onDrive={onDrive} />
      </header>
      <div className="p-3">
        {attached.length ? (
          <ul className="space-y-1.5" aria-label="Datasets used by this dashboard">
            {attached.map((dataset) => {
              const count = usage[dataset.id] ?? 0;
              return (
                <li key={dataset.id} className="flex items-start gap-2 rounded-lg border bg-background/40 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={dataset.name}>{dataset.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{dataset.columns.length} columns · {(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows · {count ? `used by ${count} widget${count === 1 ? "" : "s"}` : "not used yet"}</span>
                  </span>
                  {count === 0 ? <button type="button" aria-label={`Remove ${dataset.name}`} title="Remove from this dashboard" onClick={() => onDetach(dataset.id)} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-3.5" /></button> : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No datasets yet. Add one, then ask the AI to build with it.</p>}
        {available.length ? (
          <label className="mt-2 block">
            <span className="sr-only">Add from Library</span>
            <select aria-label="Add from Library" value="" onChange={(event) => { if (event.target.value) onAttach(event.target.value); }} className="h-8 w-full rounded-md border bg-surface px-2 text-xs text-muted-foreground outline-none focus:border-border-strong">
              <option value="">Add from Library…</option>
              {available.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}
