"use client";

import { Folder, Menu, PanelRight, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export function ChatHeader({
  title,
  workspaceName,
  panelOpen,
  onToggleRightPanel,
  quickAssistantOpen,
  onToggleQuickAssistant,
  onShare,
}: {
  title: string;
  workspaceName?: string;
  panelOpen: boolean;
  onToggleRightPanel: () => void;
  quickAssistantOpen?: boolean;
  /** Omitted before the chat exists: Quick Assistant needs a saved transcript to read. */
  onToggleQuickAssistant?: () => void;
  /** Sharing works at workspace level, so standalone chats get a disabled button explaining why. */
  onShare?: () => void;
}) {
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 sm:px-5 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden size-8 text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </Button>

      <div className="min-w-0 flex-1 truncate text-xs">
        {workspaceName ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground/80 font-normal">{workspaceName}</span>
            <span className="text-muted-foreground/60 text-[11px]">&gt;</span>
            <strong className="truncate font-semibold text-foreground">{title}</strong>
          </span>
        ) : (
          <strong className="truncate font-semibold text-foreground text-xs">{title}</strong>
        )}
      </div>

      <span className="hidden rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/90 sm:inline bg-surface/50">
        Live Gemini
      </span>

      {onToggleQuickAssistant ? <Button
        variant="ghost"
        size="sm"
        onClick={onToggleQuickAssistant}
        aria-label="Quick Assistant"
        aria-expanded={quickAssistantOpen ?? false}
        title="Ask a side question without adding it to this chat"
        className={cn(
          "h-8 gap-1.5 text-xs transition-colors",
          quickAssistantOpen ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground"
        )}
      >
        <Sparkles className="size-3.5 text-sage" />
        <span className="hidden sm:inline">Quick Assistant</span>
      </Button> : null}

      <Button
        variant="ghost"
        size="sm"
        disabled={!onShare}
        onClick={onShare}
        title={onShare ? "Share this chat's workspace" : "Move this chat into a workspace to share it"}
        className="h-8 gap-1.5 text-xs text-muted-foreground hover:bg-raised hover:text-foreground"
      >
        <Share2 className="size-3.5" />
        <span className="hidden sm:inline">Share</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleRightPanel}
        aria-label="Toggle context panel"
        aria-expanded={panelOpen}
        title="Toggle context panel"
        className={cn(
          "size-8 transition-colors",
          panelOpen ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised hover:text-foreground"
        )}
      >
        <PanelRight className="size-4" />
      </Button>
    </header>
  );
}

