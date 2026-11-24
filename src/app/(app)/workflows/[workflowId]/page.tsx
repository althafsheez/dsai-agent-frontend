import type { Metadata } from "next";
import { WorkflowOverviewPage } from "@/features/workflows/components/workflow-overview-page";
export const metadata: Metadata = { title: "Workflow" };
export default async function Page({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <WorkflowOverviewPage workflowId={workflowId} />;
}
