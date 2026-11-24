import type { Metadata } from "next";
import { WorkflowRunPage } from "@/features/workflows/components/workflow-run-page";
export const metadata: Metadata = { title: "Workflow run" };
export default async function Page({ params }: { params: Promise<{ workflowId: string; runId: string }> }) {
  const { workflowId, runId } = await params;
  return <WorkflowRunPage workflowId={workflowId} runId={runId} />;
}
