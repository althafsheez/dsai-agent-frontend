"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { ArtifactsPanel } from "./artifacts-panel";
import { ContextTabs, type ContextTab } from "./context-tabs";
import { DatasetsPanel } from "./datasets-panel";
import { FilePreviewSidebar } from "./file-preview-sidebar";
import { QuickAssistant } from "./quick-assistant";
import type { ContextSidebarProps } from "./types";

export function ContextSidebar({
  chatId,
  workspaceId,
  datasets,
  artifacts,
  selectedFile,
  onClose,
  onFileSelect,
}: ContextSidebarProps) {
  const [tab, setTab] = useState<ContextTab>("datasets");

  if (selectedFile) {
    return <FilePreviewSidebar file={selectedFile} onBack={() => onFileSelect(null)} onClose={onClose} />;
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l bg-sidebar text-sidebar-foreground" aria-label="Analysis context">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-medium text-foreground">Context</h1>
        <button type="button" onClick={onClose} aria-label="Close context" className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>
      <ContextTabs value={tab} onValueChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === "datasets" ? (
          <DatasetsPanel datasets={datasets} workspaceId={workspaceId} onFileSelect={onFileSelect} />
        ) : (
          <ArtifactsPanel artifacts={artifacts} onFileSelect={onFileSelect} />
        )}
      </div>
      <QuickAssistant key={`${chatId}:${workspaceId ?? "standalone"}`} chatId={chatId} workspaceId={workspaceId} />
    </aside>
  );
}
