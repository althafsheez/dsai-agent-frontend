import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Workflows" };
export default function Page() {
  return <PlaceholderPage title="Workflows" description="Make recurring analytical work repeatable." next="Workflow editing and execution are planned for a future release." />;
}

