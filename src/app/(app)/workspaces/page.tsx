import type { Metadata } from "next";
import { WorkspacesPage } from "@/features/workspaces/components/workspaces-page";

export const metadata: Metadata = { title: "Workspaces" };

export default function Page() {
  return <WorkspacesPage />;
}
