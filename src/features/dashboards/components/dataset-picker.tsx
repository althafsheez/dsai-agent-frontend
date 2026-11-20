"use client";

import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatasetLite } from "../types";

export function DatasetPicker({ datasets, selected, onToggle, loading }: { datasets: DatasetLite[]; selected: string[]; onToggle: (id: string) => void; loading?: boolean }) {
  if (loading) return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">Loading datasets…</p>;
  if (!datasets.length) return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">No datasets with previewable rows in your Library yet. Save a dataset from a chat to its Library first.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Datasets">
      {datasets.map((dataset) => {
        const on = selected.includes(dataset.id);
        return (
          <li key={dataset.id}>
            <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border bg-surface/40 p-3 transition-colors hover:border-border-strong", on && "border-sage/60 bg-sage/5")}>
              <input type="checkbox" checked={on} onChange={() => onToggle(dataset.id)} className="mt-0.5 accent-[var(--sage)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium"><Database className="size-3.5 shrink-0 text-sage" /><span className="truncate">{dataset.name}</span></span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{dataset.columns.length} columns · {dataset.row_count ?? dataset.rows.length} rows</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
