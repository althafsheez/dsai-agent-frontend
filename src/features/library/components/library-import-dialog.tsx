"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Database,
  FileImage,
  FileText,
  Code2,
  Search,
  X,
  Layers3,
  BarChart3,
} from "lucide-react";
import { getLibrary, type LibraryResource } from "@/lib/api";
import { formatBytes } from "@/features/context-sidebar/resource-utils";
import { Button } from "@/components/ui/button";

interface LibraryImportDialogProps {
  open: boolean;
  onClose: () => void;
  onAttach: (selectedItems: LibraryResource[]) => void;
}

type Filter = "all" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "dataset", label: "Datasets", icon: Database },
  { id: "report", label: "Reports", icon: FileText },
  { id: "visual", label: "Visuals", icon: BarChart3 },
  { id: "code", label: "Code", icon: Code2 },
];

function ResourceIcon({ item }: { item: LibraryResource }) {
  if (item.resource_type === "dataset") return <Database className="size-4 text-sage" />;
  if ("kind" in item && (item.kind === "image" || item.kind === "chart"))
    return <FileImage className="size-4 text-sky-400" />;
  if (item.library_category === "code") return <Code2 className="size-4 text-violet-400" />;
  return <FileText className="size-4 text-amber-400" />;
}

export function LibraryImportDialog({ open, onClose, onAttach }: LibraryImportDialogProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: getLibrary, enabled: open });

  const items = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (libraryQuery.data?.items ?? []).filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      return matchesSearch && (filter === "all" || item.library_category === filter);
    });
  }, [filter, libraryQuery.data?.items, query]);

  if (!open) return null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    const allItems = libraryQuery.data?.items ?? [];
    const selected = allItems.filter((item) => selectedIds.has(item.id));
    onAttach(selected);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="flex h-[560px] w-full max-w-2xl flex-col rounded-xl border border-border-strong bg-[#181a1d] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg border bg-surface text-sage">
              <BookOpen className="size-4" />
            </span>
            <div>
              <h2 id="library-import-title" className="text-sm font-semibold text-foreground">
                Import from Library
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Select saved datasets or artifacts to attach to this analysis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Toolbar: Filters & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5 bg-surface/30">
          <div role="tablist" aria-label="Filter library assets" className="flex items-center gap-1">
            {FILTERS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  filter === id
                    ? "bg-raised text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search library..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Item List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {libraryQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 w-full animate-pulse rounded-lg border bg-surface/50" />
              ))}
            </div>
          ) : items.length ? (
            <div className="space-y-1.5" role="list">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => toggleSelect(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggleSelect(item.id);
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                      isSelected
                        ? "border-sage/50 bg-sage/5 text-foreground"
                        : "border-border/60 bg-surface/40 hover:bg-surface/80"
                    }`}
                  >
                    <div
                      className={`grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                        isSelected
                          ? "border-sage bg-sage text-sidebar"
                          : "border-border-strong bg-background"
                      }`}
                    >
                      {isSelected ? <Check className="size-3 stroke-[3]" /> : null}
                    </div>

                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-surface">
                      <ResourceIcon item={item} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.resource_type === "dataset" ? "Dataset" : item.kind ?? "File"} · {formatBytes(item.size_bytes)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center p-6">
              <div>
                <BookOpen className="mx-auto size-7 text-muted-foreground/60" />
                <p className="mt-2 text-xs font-medium text-foreground">
                  {query ? "No matching files in Library" : "No saved files in Library"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saved datasets and artifacts will appear here.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3 bg-surface/30">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? "file" : "files"} selected
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleConfirm}
              className="bg-sage text-sidebar hover:bg-sage/90"
            >
              Attach {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
