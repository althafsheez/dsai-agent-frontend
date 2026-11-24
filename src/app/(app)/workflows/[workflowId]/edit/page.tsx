import type { Metadata } from "next";
import { WorkflowEditPage } from "@/features/workflows/components/workflow-edit-page";
export const metadata: Metadata = { title: "Edit workflow" };
export default async function Page({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <WorkflowEditPage workflowId={workflowId} />;
}
