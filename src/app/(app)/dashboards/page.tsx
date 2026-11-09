import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Dashboards" };
export default function Page() {
  return <PlaceholderPage title="Dashboards" description="Keep your most useful insights in view." next="Dashboard building is planned for a future release." />;
}

