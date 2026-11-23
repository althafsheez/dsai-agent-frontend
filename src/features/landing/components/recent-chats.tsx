"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getChats, getWorkspaces } from "@/lib/api";

function relativeUpdatedAt(value: string): string {
  const updatedAt = new Date(value);
  const elapsed = Date.now() - updatedAt.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(updatedAt);
}

export function RecentChats() {
  const chatsQuery = useQuery({
    queryKey: ["sidebar", "recent-chats"],
    queryFn: getChats,
    staleTime: 10_000,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
    staleTime: 10_000,
  });

  if (chatsQuery.isLoading || workspacesQuery.isLoading) {
    return (
      <div aria-label="Loading recent chats" className="space-y-1.5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    );
  }

  if (chatsQuery.isError || workspacesQuery.isError) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">Recent chats could not be loaded.</p>;
  }

  const workspaceNames = new Map(
    (workspacesQuery.data?.items ?? []).map((workspace) => [workspace.id, workspace.name]),
  );
  const chats = (chatsQuery.data?.items ?? [])
    .filter((chat) => !chat.archived_at && !chat.deleted_at)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 5);

  if (!chats.length) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No recent chats yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {chats.map((chat) => {
        const workspaceName = chat.workspace_id
          ? workspaceNames.get(chat.workspace_id) ?? "Unavailable workspace"
          : "Standalone";

        return (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_150px_74px]"
          >
            <p className="truncate text-[15px] font-medium text-foreground">{chat.title}</p>
            <p className="hidden self-center truncate text-[12px] text-muted-foreground sm:block">
              {workspaceName}
            </p>
            <time
              dateTime={chat.updated_at}
              className="self-center text-right whitespace-nowrap text-[12px] text-muted-foreground"
            >
              {relativeUpdatedAt(chat.updated_at)}
            </time>
          </Link>
        );
      })}
    </div>
  );
}
