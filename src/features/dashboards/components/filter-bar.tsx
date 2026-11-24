"use client";

import { ChevronDown, Filter, X } from "lucide-react";
import { slicerCandidates, sliceValues } from "../logic/aggregate";
import type { DatasetLite, Filters } from "../types";

interface FilterBarProps {
  datasets: DatasetLite[];
  slicers: string[];
  onSlicersChange: (slicers: string[]) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /** Viewing (not editing): filters can still be used, but the slicer list cannot be changed. */
  readOnlySlicers?: boolean;
}

export function toggleFilter(filters: Filters, column: string, value: string): Filters {
  const current = filters[column] ?? [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  const rest = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== column));
  return next.length ? { ...rest, [column]: next } : rest;
}

/** Power BI-style slicers plus chips for every active filter (including ones set by clicking a chart). */
export function FilterBar({ datasets, slicers, onSlicersChange, filters, onFiltersChange, readOnlySlicers }: FilterBarProps) {
  const candidates = readOnlySlicers ? [] : slicerCandidates(datasets).filter((column) => !slicers.includes(column));
  const active = Object.entries(filters).flatMap(([column, values]) => values.map((value) => ({ column, value })));
  if (!datasets.length) return null;
  return (
    <div className="mb-4 rounded-xl border bg-surface/40 p-3" role="group" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground"><Filter className="size-3.5" />Filters</span>
        {slicers.map((column) => {
          const values = sliceValues(datasets, column) ?? [];
          const picked = filters[column] ?? [];
          return (
            <details key={column} className="group relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs hover:border-border-strong">
                {column}{picked.length ? <span className="rounded bg-raised px-1 text-[10px]">{picked.length}</span> : null}<ChevronDown className="size-3 text-muted-foreground" />
              </summary>
              <div className="absolute z-20 mt-1 max-h-60 min-w-44 overflow-auto rounded-lg border bg-background p-1.5 shadow-lg">
                {values.map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-raised">
                    <input type="checkbox" checked={picked.includes(value)} onChange={() => onFiltersChange(toggleFilter(filters, column, value))} className="accent-[var(--sage)]" />
                    <span className="truncate">{value}</span>
                  </label>
                ))}
                {readOnlySlicers ? null : <button type="button" onClick={() => onSlicersChange(slicers.filter((item) => item !== column))} className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-raised hover:text-red-300">Remove slicer</button>}
              </div>
            </details>
          );
        })}
        {candidates.length ? (
          <select aria-label="Add slicer" value="" onChange={(event) => event.target.value && onSlicersChange([...slicers, event.target.value])} className="h-8 rounded-md border border-dashed bg-transparent px-2 text-xs text-muted-foreground">
            <option value="">+ Add slicer</option>
            {candidates.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        ) : null}
        {active.length ? <button type="button" onClick={() => onFiltersChange({})} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">Clear all</button> : null}
      </div>
      {active.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Active filters">
          {active.map(({ column, value }) => (
            <li key={`${column}:${value}`}>
              <button type="button" onClick={() => onFiltersChange(toggleFilter(filters, column, value))} className="inline-flex items-center gap-1 rounded-full border bg-raised px-2 py-0.5 text-[11px] hover:border-border-strong" aria-label={`Remove filter ${column} ${value}`}>
                <span className="text-muted-foreground">{column}:</span>{value}<X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1.5 text-[11px] text-muted-foreground">Click a bar or slice to cross-filter every chart, or add a slicer.</p>}
    </div>
  );
}
