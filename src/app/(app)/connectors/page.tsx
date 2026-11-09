import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Connectors" };
export default function Page() {
  return <PlaceholderPage title="Connectors" description="Bring your data into your workspace." next="File uploads will be connected first. External data sources will follow later." />;
}

