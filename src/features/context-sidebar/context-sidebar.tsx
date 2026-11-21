"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ArtifactsPanel } from "./artifacts-panel";
import { ContextTabs, type ContextTab } from "./context-tabs";
import { DatasetsPanel } from "./datasets-panel";
import type { ContextSidebarProps } from "./types";

export function ContextSidebar({
  workspaceId,
  datasets,
  artifacts,
  onClose,
  onFileSelect,
  onLibraryToggle,
}: ContextSidebarProps) {
  const [tab, setTab] = useState<ContextTab>("datasets");
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredDatasets = useMemo(() => {
    if (!normalizedQuery) return datasets;
    return datasets.filter((dataset) =>
      dataset.name.toLowerCase().includes(normalizedQuery)
    );
  }, [datasets, normalizedQuery]);

  const filteredArtifacts = useMemo(() => {
    if (!normalizedQuery) return artifacts;
    return artifacts.filter((artifact) =>
      artifact.name.toLowerCase().includes(normalizedQuery)
    );
  }, [artifacts, normalizedQuery]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l bg-sidebar text-sidebar-foreground" aria-label="Analysis context">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-medium text-foreground">Context</h1>
        <button type="button" onClick={onClose} aria-label="Close context" className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>
      <ContextTabs value={tab} onValueChange={setTab} />
      <div className="border-b px-3 py-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            placeholder="Search datasets and artifacts..."
            aria-label="Search datasets and artifacts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 grid size-4 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "datasets" ? (
          <DatasetsPanel
            datasets={filteredDatasets}
            workspaceId={workspaceId}
            onFileSelect={onFileSelect}
            onLibraryToggle={onLibraryToggle}
            searchQuery={searchQuery}
          />
        ) : (
          <ArtifactsPanel
            artifacts={filteredArtifacts}
            onFileSelect={onFileSelect}
            onLibraryToggle={onLibraryToggle}
            searchQuery={searchQuery}
          />
        )}
      </div>
    </aside>
  );
}
