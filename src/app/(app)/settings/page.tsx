import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Settings" };
export default function Page() {
  return <PlaceholderPage title="Settings" description="Make the workspace your own." next="Account and workspace preferences will be connected in a later phase." />;
}

