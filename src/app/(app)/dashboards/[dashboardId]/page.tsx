import type { Metadata } from "next";
import { DashboardViewPage } from "@/features/dashboards/components/dashboard-view-page";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page({ params }: { params: Promise<{ dashboardId: string }> }) {
  const { dashboardId } = await params;
  return <DashboardViewPage dashboardId={dashboardId} />;
}
