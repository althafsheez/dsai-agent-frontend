import type { Metadata } from "next";
import { WorkflowsPage } from "@/features/workflows/components/workflows-page";
export const metadata: Metadata = { title: "Workflows" };
export default function Page() {
  return <WorkflowsPage />;
}
