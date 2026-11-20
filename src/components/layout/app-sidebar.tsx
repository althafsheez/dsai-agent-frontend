"use client";

import Link from "next/link";
import { LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, Settings, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getActivity } from "@/lib/api";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Brand } from "./brand";
import { SearchDialog } from "./search-dialog";
import { SidebarSection } from "./sidebar-section";
import { SidebarNavItem } from "./sidebar-nav-item";
import { navigation } from "./navigation";
import { SidebarPinnedList } from "@/features/pinning";
import { SidebarUsage } from "@/features/usage/sidebar-usage";

export function SidebarContent({ mobile = false }: { mobile?: boolean }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const compact = collapsed && !mobile;
  const closeMobile = () => { if (mobile) setMobileOpen(false); };
  const activityQuery = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: 2000,
  });
  const activity = activityQuery.data?.items ?? [];

  return (
    <div className="flex h-full flex-col bg-sidebar select-none">
      <div className={compact ? "flex h-14 items-center justify-center border-b border-sidebar-border/40" : "flex h-14 items-center gap-1.5 px-3.5 border-b border-sidebar-border/40"}>
        {!compact && (
          <Link href="/" onClick={closeMobile} aria-label="DSAI home" className="mr-auto rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <Brand />
          </Link>
        )}
        {!compact && !mobile && <SearchDialog sidebar />}
        <Button
          variant="ghost"
          size="icon"
          onClick={mobile ? closeMobile : toggleSidebar}
          aria-label={mobile ? "Close navigation" : compact ? "Expand sidebar" : "Collapse sidebar"}
          className="size-8 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {mobile ? <X className="size-4" /> : compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      <div className={compact ? "p-2" : "p-3"}>
        <Button
          asChild
          size="sm"
          className={compact ? "w-full justify-center px-0 h-8" : "w-full justify-start h-8 px-2.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"}
        >
          <Link href="/" onClick={closeMobile} aria-label="New Analysis">
            <Plus className="size-4 shrink-0" />
            {!compact && <span className="ml-2">New Analysis</span>}
          </Link>
        </Button>
        {compact && (
          <div className="mt-2 flex justify-center">
            <SearchDialog />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 scrollbar-none">
        {!compact && (
          <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
            Workspace
          </p>
        )}
        <nav aria-label="Main navigation" className="space-y-0.5">
          {navigation.map((item) => (
            <SidebarNavItem key={item.href} {...item} compact={compact} onNavigate={closeMobile} />
          ))}
        </nav>

        {!compact && (
          <div className="px-0.5 mt-2">
            <SidebarSection title="Pinned">
              <SidebarPinnedList onNavigate={closeMobile} />
            </SidebarSection>
            <SidebarSection title="Activity">
              {activity.length ? (
                <div className="space-y-1">
                  {activity.map((chat) => {
                    const running = chat.active_run_status === "running" || chat.active_run_status === "queued";
                    return (
                      <Link
                        key={chat.id}
                        href={`/chat/${chat.id}`}
                        onClick={closeMobile}
                        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                      >
                        {running ? (
                          <LoaderCircle className="size-3 shrink-0 animate-spin text-sage" />
                        ) : (
                          <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-sage" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                        <span className="shrink-0 text-[9px] text-muted-foreground">{running ? "Running..." : "●"}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
                  <span className="size-1.5 shrink-0 rounded-full bg-border-strong" />
                  <span>All quiet for now.</span>
                </div>
              )}
            </SidebarSection>
          </div>
        )}
      </div>

      {!compact && <SidebarUsage onNavigate={closeMobile} />}
      <div className={compact ? "flex flex-col items-center gap-2 border-t border-sidebar-border/40 py-3" : "flex items-center gap-2.5 border-t border-sidebar-border/40 px-3.5 py-3"}>
        <Link
          href="/login"
          onClick={closeMobile}
          aria-label="Demo user account"
          className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong bg-raised text-[10px] font-semibold text-foreground hover:border-foreground/30 transition-colors"
        >
          DU
        </Link>
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">Demo user</p>
            <p className="text-[10px] text-muted-foreground truncate">Personal workspace</p>
          </div>
        )}
        <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
          <Link href="/settings" onClick={closeMobile} aria-label="Settings">
            <Settings className="size-4" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
