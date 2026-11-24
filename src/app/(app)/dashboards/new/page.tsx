import type { Metadata } from "next";
import { DashboardBuilderPage } from "@/features/dashboards/components/dashboard-builder-page";

export const metadata: Metadata = { title: "Create dashboard" };

export default function Page() {
  return <DashboardBuilderPage />;
}
