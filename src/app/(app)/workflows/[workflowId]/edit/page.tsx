import type { Metadata } from "next";
import { WorkflowBuilderPage } from "@/features/workflows/components/workflow-builder-page";
export const metadata: Metadata = { title: "Edit workflow" };
export default async function Page({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <WorkflowBuilderPage workflowId={workflowId} />;
}
