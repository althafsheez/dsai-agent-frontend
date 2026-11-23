"use client";

import Link from "next/link";
import { FolderKanban, MessageSquare, PinOff } from "lucide-react";
import { usePinnedItems } from "./use-pinned-items";

export function SidebarPinnedList({ onNavigate }: { onNavigate?: () => void }) {
  const { items, isLoading, togglePin } = usePinnedItems();

  if (isLoading) {
    return <div aria-label="Loading pinned items" className="h-6 animate-pulse rounded-md bg-sidebar-accent/60" />;
  }

  if (!items.length) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground/90 py-1">
        Keep important work close.<br />Your pinned items will appear here.
      </p>
    );
  }

  return (
    <ul aria-label="Pinned items" className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.kind === "chat" ? MessageSquare : FolderKanban;
        return (
          <li key={`${item.kind}:${item.id}`} className="group relative">
            <Link
              href={item.href}
              onClick={onNavigate}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </Link>
            <button
              type="button"
              onClick={() => togglePin(item.kind, item.id, false)}
              aria-label={`Unpin ${item.title}`}
              className="absolute right-1 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 transition-opacity"
            >
              <PinOff className="size-3" strokeWidth={1.5} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
