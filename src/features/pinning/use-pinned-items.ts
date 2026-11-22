"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getChats, getWorkspaces, updateChat, updateWorkspace } from "@/lib/api";

export type PinnedKind = "chat" | "workspace";

export interface PinnedItem {
  kind: PinnedKind;
  id: string;
  title: string;
  href: string;
  pinnedAt: string;
}

// Same keys the sidebar flyouts and Recent Chats already use, so a pin toggled anywhere updates every list.
const CHATS_KEY = ["sidebar", "recent-chats"] as const;
const WORKSPACES_KEY = ["workspaces"] as const;

export function usePinnedItems() {
  const chatsQuery = useQuery({ queryKey: CHATS_KEY, queryFn: getChats, staleTime: 10_000 });
  const workspacesQuery = useQuery({ queryKey: WORKSPACES_KEY, queryFn: getWorkspaces, staleTime: 10_000 });

  const items: PinnedItem[] = [
    ...(chatsQuery.data?.items ?? [])
      .filter((chat) => chat.pinned_at && !chat.archived_at && !chat.deleted_at)
      .map((chat) => ({ kind: "chat" as const, id: chat.id, title: chat.title, href: `/chat/${chat.id}`, pinnedAt: chat.pinned_at! })),
    ...(workspacesQuery.data?.items ?? [])
      .filter((workspace) => workspace.pinned_at && !workspace.archived_at && !workspace.deleted_at)
      .map((workspace) => ({ kind: "workspace" as const, id: workspace.id, title: workspace.name, href: `/workspaces/${workspace.id}`, pinnedAt: workspace.pinned_at! })),
  ].sort((left, right) => new Date(right.pinnedAt).getTime() - new Date(left.pinnedAt).getTime());

  const { togglePin, isPending } = useTogglePin();

  return {
    items,
    isLoading: chatsQuery.isLoading || workspacesQuery.isLoading,
    isError: chatsQuery.isError || workspacesQuery.isError,
    togglePin,
    isPending,
  };
}

/** Pin or unpin without loading the pinned lists, for pages that only need the action. */
export function useTogglePin() {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ kind, id, pinned }: { kind: PinnedKind; id: string; pinned: boolean }): Promise<void> => {
      if (kind === "chat") await updateChat(id, { pinned });
      else await updateWorkspace(id, { pinned });
    },
    onSuccess: async (_result, { kind, id }) => {
      if (kind === "chat") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: CHATS_KEY }),
          queryClient.invalidateQueries({ queryKey: ["history"] }),
          queryClient.invalidateQueries({ queryKey: ["chat", id] }),
        ]);
      } else {
        void queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
        void queryClient.invalidateQueries({ queryKey: ["workspace", id] });
      }
    },
  });

  return {
    togglePin: (kind: PinnedKind, id: string, pinned: boolean) => toggle.mutate({ kind, id, pinned }),
    isPending: toggle.isPending,
    isError: toggle.isError,
  };
}
