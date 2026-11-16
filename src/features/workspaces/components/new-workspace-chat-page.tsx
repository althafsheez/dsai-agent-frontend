"use client";

import { useQuery } from "@tanstack/react-query";
import { ChatHeader } from "@/features/chat/components/chat-header";
import { WelcomeComposer } from "@/features/landing/components/welcome-composer";
import { getWorkspace } from "@/lib/api";

/** A browser-only draft. It intentionally has no chat ID until its first send. */
export function NewWorkspaceChatPage({ workspaceId }: { workspaceId: string }) {
  const workspace = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => getWorkspace(workspaceId) });

  if (workspace.isLoading) return <section className="p-8 text-sm text-muted-foreground">Loading workspace…</section>;
  if (workspace.isError || !workspace.data) return <section className="p-8 text-sm">Workspace could not be found.</section>;
  return <div className="flex min-h-full flex-col">
    <ChatHeader title="New chat" workspaceName={workspace.data.name} panelOpen={false} onToggleRightPanel={() => undefined} />
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-7 text-center"><h1 className="text-2xl font-semibold tracking-tight">New chat</h1><p className="mt-2 text-sm text-muted-foreground">Start an analysis in {workspace.data.name}. Nothing is saved until you send a query.</p></div>
      <WelcomeComposer initialWorkspaceId={workspaceId} />
    </main>
  </div>;
}
