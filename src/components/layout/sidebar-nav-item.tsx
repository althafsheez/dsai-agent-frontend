"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { getChats, getWorkspaces } from "@/lib/api";
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
  const quickItems = isRecentAnalyses
    ? (chatsQuery.data?.items ?? []).filter((chat) => !chat.archived_at && !chat.deleted_at).slice(0, 4).map((chat) => ({ id: chat.id, name: chat.title, href: `/chat/${chat.id}`, updatedAt: chat.updated_at }))
    : isWorkspaces
      ? (workspacesQuery.data?.items ?? []).filter((workspace) => !workspace.archived_at && !workspace.deleted_at).slice(0, 4).map((workspace) => ({ id: workspace.id, name: workspace.name, href: `/workspaces/${workspace.id}`, updatedAt: workspace.updated_at }))
      : [];
  const quickItemsLoading = isRecentAnalyses ? chatsQuery.isLoading : isWorkspaces ? workspacesQuery.isLoading : false;
  const active = pathname === href || pathname.startsWith(href + "/");
  const link = <Link href={href} aria-label={compact ? label : undefined} aria-current={active ? "page" : undefined}
    onClick={() => { setOpen(false); onNavigate?.(); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
    className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors", compact && "justify-center px-0", active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
    {!compact && <span>{label}</span>}
  </Link>;
  if (!flyout && !compact) return link;
  return <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={300} closeDelay={100}>
    <HoverCard.Trigger asChild>{link}</HoverCard.Trigger>
    <HoverCard.Portal><HoverCard.Content side="right" align="start" sideOffset={12} className="z-50 w-64 rounded-lg border bg-surface p-2 shadow-xl" onEscapeKeyDown={() => setOpen(false)}>
      <div className="flex items-center justify-between gap-3 px-2 py-1"><p className="text-xs font-medium">{label}</p>{quickItems.length ? <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Quick access</span> : null}</div>
      {flyout && hasQuickAccess ? (quickItemsLoading ? <div aria-label={`Loading ${label.toLowerCase()}`} className="mt-1 space-y-1">{[0, 1, 2].map((item) => <div key={item} className="h-9 animate-pulse rounded-md bg-raised" />)}</div> : quickItems.length ? <div className="mt-1 space-y-0.5">{quickItems.map((item) => <Link key={item.id} href={item.href} onClick={() => { setOpen(false); onNavigate?.(); }} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent"><span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">{item.name}</span><time dateTime={item.updatedAt} className="shrink-0 text-[9px] text-muted-foreground">{relativeUpdatedAt(item.updatedAt)}</time></Link>)}</div> : <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">No recent {isWorkspaces ? "workspaces" : "analyses"} yet.</p>) : flyout ? <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">Open {label.toLowerCase()} to get started.</p> : null}
      {flyout && hasQuickAccess ? <Link href={href} onClick={() => { setOpen(false); onNavigate?.(); }} className="mt-1 flex h-8 items-center rounded-md border-t px-2 text-[11px] font-medium text-slate hover:bg-sidebar-accent hover:text-foreground">View all {isWorkspaces ? "workspaces" : "analyses"}</Link> : null}
    </HoverCard.Content></HoverCard.Portal>
  </HoverCard.Root>;
}
