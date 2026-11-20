import type { Metadata } from "next";
import { WorkflowBuilderPage } from "@/features/workflows/components/workflow-builder-page";
export const metadata: Metadata = { title: "Create workflow" };
export default function Page() {
  return <WorkflowBuilderPage />;
}
