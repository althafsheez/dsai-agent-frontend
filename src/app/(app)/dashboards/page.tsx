import type { Metadata } from "next";
import { DashboardsPage } from "@/features/dashboards/components/dashboards-page";

export const metadata: Metadata = { title: "Dashboards" };

export default function Page() {
  return <DashboardsPage />;
}
