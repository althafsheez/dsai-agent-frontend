"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { usePinnedItems } from "./use-pinned-items";

const KIND_LABEL = { chat: "Analysis", workspace: "Workspace" } as const;

export function PinnedOverview() {
  const { items, isLoading, isError, togglePin } = usePinnedItems();

  if (isLoading) {
    return (
      <div aria-label="Loading pinned items" className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[54px] animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">Pinned items could not be loaded.</p>;
  }

  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        Nothing pinned yet. Pin a chat or workspace to keep it here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item) => {
        return (
          <div
            key={`${item.kind}:${item.id}`}
            className="group relative flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface"
          >
            <Link href={item.href} className="min-w-0 flex-1 after:absolute after:inset-0 focus-visible:outline-none">
              <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{KIND_LABEL[item.kind]}</p>
            </Link>
            <button
              type="button"
              onClick={() => togglePin(item.kind, item.id, false)}
              aria-label={`Unpin ${item.title}`}
              title="Unpin"
              className="relative z-10 grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            >
              <Pin className="size-3.5 fill-current" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
