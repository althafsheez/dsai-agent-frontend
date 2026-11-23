"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Pin, PinOff, type LucideIcon } from "lucide-react";
import { useTogglePin } from "@/features/pinning/use-pinned-items";
import { getActivity, getChats, getWorkspaces } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  label: string; href: string; icon: LucideIcon; flyout: boolean;
  compact: boolean; onNavigate?: () => void;
};

function relativeUpdatedAt(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export function SidebarNavItem({ label, href, icon: Icon, flyout, compact, onNavigate }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLAnchorElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { togglePin, isPending: pinPending, isError: pinFailed } = useTogglePin();
  const isRecentAnalyses = href === "/history";
  const isWorkspaces = href === "/workspaces";
  const hasQuickAccess = isRecentAnalyses || isWorkspaces;
  const chatsQuery = useQuery({
    queryKey: ["sidebar", "recent-chats"],
    queryFn: getChats,
    enabled: isRecentAnalyses,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
    enabled: isWorkspaces,
    staleTime: 10_000,
  });
  const activityQuery = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    enabled: isRecentAnalyses,
    refetchInterval: 2000,
  });
  const activityByChatId = new Map((activityQuery.data?.items ?? []).map((chat) => [chat.id, chat]));
  const quickItems = isRecentAnalyses
    ? (chatsQuery.data?.items ?? [])
        .filter((chat) => !chat.archived_at && !chat.deleted_at)
        .sort((a, b) => Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at)) || Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .map((chat) => ({ id: chat.id, name: chat.title, href: `/chat/${chat.id}`, updatedAt: chat.updated_at, pinned: Boolean(chat.pinned_at) }))
    : isWorkspaces
      ? (workspacesQuery.data?.items ?? []).filter((workspace) => !workspace.archived_at && !workspace.deleted_at).map((workspace) => ({ id: workspace.id, name: workspace.name, href: `/workspaces/${workspace.id}`, updatedAt: workspace.updated_at, pinned: false }))
      : [];
  const quickItemsLoading = isRecentAnalyses ? chatsQuery.isLoading : isWorkspaces ? workspacesQuery.isLoading : false;
  const active = pathname === href || pathname.startsWith(href + "/");
  const link = (
    <Link
      ref={trigger}
      href={href}
      aria-label={compact ? label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={() => { setOpen(false); onNavigate?.(); }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (content.current?.contains(event.relatedTarget)) event.preventDefault();
        else setOpen(false);
      }}
      onKeyDown={(event) => {
        const firstItem = content.current?.querySelector<HTMLElement>("a, button");
        if (event.key === "ArrowDown" && firstItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        compact && "justify-center px-0 h-9",
        "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      {!compact && <span>{label}</span>}
    </Link>
  );
  if (!flyout && !compact) return link;
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={250} closeDelay={100}>
      <HoverCard.Trigger asChild>{link}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          ref={content}
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-64 rounded-lg border border-border-strong bg-surface/95 p-2 shadow-2xl backdrop-blur-md"
          onEscapeKeyDown={() => {
            if (content.current?.contains(document.activeElement)) trigger.current?.focus();
            setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a, button"));
            const current = items.findIndex((item) => item === document.activeElement);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            event.preventDefault();
            items[(current + direction + items.length) % items.length]?.focus();
          }}
        >
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <p className="text-xs font-semibold text-foreground">{label}</p>
            {quickItems.length ? (
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Quick access</span>
            ) : null}
          </div>
          {flyout && hasQuickAccess ? (
            quickItemsLoading ? (
              <div aria-label={`Loading ${label.toLowerCase()}`} className="mt-1 space-y-1">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-8 animate-pulse rounded-md bg-raised" />
                ))}
              </div>
            ) : quickItems.length ? (
              <div className="mt-1 max-h-[min(10rem,calc(var(--radix-hover-card-content-available-height,15rem)_-_5rem))] space-y-0.5 overflow-y-auto overscroll-y-contain p-1">
                {quickItems.map((item) => (
                  <div key={item.id} className="group flex items-center rounded-md hover:bg-sidebar-accent">
                    <Link
                      href={item.href}
                      onClick={() => { setOpen(false); onNavigate?.(); }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      {isRecentAnalyses && activityByChatId.has(item.id) ? (
                        activityByChatId.get(item.id)?.active_run_status === "running" || activityByChatId.get(item.id)?.active_run_status === "queued" ? (
                          <LoaderCircle aria-label="Running" className="size-3 shrink-0 animate-spin text-sage" />
                        ) : (
                          <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-sage" />
                        )
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{item.name}</span>
                      <time dateTime={item.updatedAt} className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeUpdatedAt(item.updatedAt)}
                      </time>
                    </Link>
                    {isRecentAnalyses && (
                      <button
                        type="button"
                        aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.name}`}
                        title={item.pinned ? "Unpin analysis" : "Pin analysis"}
                        aria-disabled={pinPending}
                        onClick={() => { if (!pinPending) togglePin("chat", item.id, !item.pinned); }}
                        className={cn("group/pin mr-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground", item.pinned ? "text-foreground" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                      >
                        <Pin aria-hidden="true" className={cn("size-3.5", item.pinned && "fill-current group-hover/pin:hidden group-focus-visible/pin:hidden")} />
                        {item.pinned && <PinOff aria-hidden="true" className="hidden size-3.5 group-hover/pin:block group-focus-visible/pin:block" />}
                      </button>
                    )}
                  </div>
                ))}
                {isRecentAnalyses && pinFailed && <p role="alert" className="px-2 text-xs text-destructive">Could not update the pin. Try again.</p>}
              </div>
            ) : (
              <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                No recent {isWorkspaces ? "workspaces" : "analyses"} yet.
              </p>
            )
          ) : flyout ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              Open {label.toLowerCase()} to get started.
            </p>
          ) : null}
          {flyout && hasQuickAccess ? (
            <Link
              href={href}
              onClick={() => { setOpen(false); onNavigate?.(); }}
              className="mt-1 flex h-8 items-center rounded-md border-t border-border px-2 text-[11px] font-medium text-slate hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              View all {isWorkspaces ? "workspaces" : "analyses"}
            </Link>
          ) : null}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
