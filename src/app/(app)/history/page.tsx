import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "History" };
export default function Page() {
  return <PlaceholderPage title="History" description="Revisit your analyses and workspaces." next="Search, ownership filters and archived items will live here." />;
}

