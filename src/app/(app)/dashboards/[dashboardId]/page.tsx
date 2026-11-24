import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardViewPage } from "@/features/dashboards/components/dashboard-view-page";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page({ params }: { params: Promise<{ dashboardId: string }> }) {
  const { dashboardId } = await params;
  if (dashboardId === "new") notFound();
  return <DashboardViewPage dashboardId={dashboardId} />;
}
