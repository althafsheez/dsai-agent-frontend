import type { Metadata } from "next";
import { WorkspaceDetailPage } from "@/features/workspaces/components/workspace-detail-page";
export const metadata: Metadata = { title: "Workspace" };
export default async function Page({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <WorkspaceDetailPage workspaceId={workspaceId} />;
}
