"use client";

import { Folder, PanelRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatHeader({ title, workspaceName, onToggleRightPanel }: { title: string; workspaceName?: string; onToggleRightPanel?: () => void }) {
  const toggle = () => {
    onToggleRightPanel?.();
    window.dispatchEvent(new CustomEvent("dsai:toggle-context-panel"));
  };
  return <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-5">
    <div className="min-w-0 flex-1 truncate text-xs">
      {workspaceName ? <span className="inline-flex min-w-0 items-center gap-1.5"><Folder className="size-3.5 shrink-0 text-muted-foreground" /><button className="truncate text-muted-foreground hover:text-foreground">{workspaceName}</button><span className="text-muted-foreground">/</span><strong className="truncate font-medium">{title}</strong></span> : <strong className="font-medium">{title}</strong>}
    </div>
    <span className="hidden rounded border px-2 py-1 text-[10px] text-muted-foreground sm:inline">Simulated preview</span>
    <Button variant="ghost" size="sm" disabled title="Sharing will be connected later"><Share2 />Share</Button>
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle context panel" title="Toggle context panel"><PanelRight /></Button>
  </header>;
}
