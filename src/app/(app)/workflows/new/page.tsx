import type { Metadata } from "next";
import { NewWorkflowPage } from "@/features/workflows/components/workflow-edit-page";

export const metadata: Metadata = { title: "New workflow" };

export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string | string[] }> }) {
  const { template } = await searchParams;
  return <NewWorkflowPage templateId={typeof template === "string" ? template : undefined} />;
}
