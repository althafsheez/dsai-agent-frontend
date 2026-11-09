import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Workspaces" };
export default function Page() {
  return <PlaceholderPage title="Workspaces" description="Organize your data and conversations around a project, topic or client." next="Workspace creation and shared datasets are planned for the next phase." />;
}

