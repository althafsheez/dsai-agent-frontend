"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryFilterOptions, HistoryFilters, HistoryOwnership, HistorySort, HistoryStatus, HistoryTime } from "../types";

interface HistoryToolbarProps {
  filters: HistoryFilters;
  options: HistoryFilterOptions;
  onChange: (patch: Partial<HistoryFilters>) => void;
}

function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return <div aria-label={label} className="inline-flex h-8 rounded-md border bg-surface p-0.5">
    {options.map((option) => <button
      key={option.value}
      type="button"
      aria-pressed={value === option.value}
      onClick={() => onChange(option.value)}
      className={cn("rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground", value === option.value && "bg-raised text-foreground")}
    >{option.label}</button>)}
  </div>;
}

function FiltersPopover({ filters, options, onChange }: HistoryToolbarProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const activeCount = Number(filters.time !== "any") + Number(filters.authorId !== "all") + Number(filters.workspaceId !== "all");

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div ref={container} className="relative">
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground">
      <Filter className="size-3.5" /> Filters
      {activeCount > 0 && <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{activeCount}</span>}
    </button>
    {open && <div role="dialog" aria-label="History filters" className="absolute left-0 top-10 z-30 w-64 rounded-lg border bg-[var(--surface-raised)] p-3 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium">Filters</p>
        {activeCount > 0 && <button type="button" onClick={() => onChange({ time: "any", authorId: "all", workspaceId: "all" })} className="text-[11px] text-muted-foreground hover:text-foreground">Clear all</button>}
      </div>
      <div className="space-y-3">
        <FilterSelect label="Time" value={filters.time} onChange={(value) => onChange({ time: value as HistoryTime })} options={[
          ["any", "Any time"], ["day", "Last 24 hours"], ["week", "Last 7 days"], ["month", "Last 30 days"], ["quarter", "Last 90 days"],
        ]} />
        <FilterSelect label="Author" value={filters.authorId} onChange={(authorId) => onChange({ authorId })} options={[["all", "All authors"], ...options.authors.map((author) => [author.id, author.name] as [string, string])]} />
        <FilterSelect label="Workspace" value={filters.workspaceId} onChange={(workspaceId) => onChange({ workspaceId })} options={[["all", "All workspaces"], ["standalone", "Standalone"], ...options.workspaces.map((workspace) => [workspace.id, workspace.name] as [string, string])]} />
      </div>
    </div>}
  </div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="block text-[11px] font-medium text-muted-foreground">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border bg-surface px-2 text-xs text-foreground outline-none focus:border-border-strong">
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  </label>;
}

export function HistoryToolbar({ filters, options, onChange }: HistoryToolbarProps) {
  return <div className="space-y-3">
    <label className="relative block">
      <span className="sr-only">Search chats</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={filters.search} onChange={(event) => onChange({ search: event.target.value })} placeholder="Search chats..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />
      {filters.search && <button type="button" aria-label="Clear search" onClick={() => onChange({ search: "" })} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl<HistoryOwnership> label="Ownership" value={filters.ownership} onChange={(ownership) => onChange({ ownership })} options={[{ value: "owned", label: "Owned" }, { value: "all", label: "All" }]} />
      <SegmentedControl<HistoryStatus> label="Archive status" value={filters.status} onChange={(status) => onChange({ status })} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} />
      <FiltersPopover filters={filters} options={options} onChange={onChange} />
      <label className="relative ml-auto">
        <span className="sr-only">Sort history</span>
        <select value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as HistorySort })} className="h-8 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-7 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong">
          <option value="updated_desc">Recent</option>
          <option value="updated_asc">Oldest</option>
          <option value="name_asc">Name</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>
    </div>
  </div>;
}
