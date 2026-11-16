import type { Metadata } from "next";
import { NewWorkspaceChatPage } from "@/features/workspaces/components/new-workspace-chat-page";

export const metadata: Metadata = { title: "New chat" };

export default async function Page({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <NewWorkspaceChatPage workspaceId={workspaceId} />;
}
