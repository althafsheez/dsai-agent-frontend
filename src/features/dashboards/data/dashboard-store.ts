import { ApiError, deleteDashboardRecord, getDashboardRecord, listDashboardRecords, saveDashboardRecord } from "@/lib/api";
import type { DashboardRecordDto } from "@/lib/api";
import type { Dashboard } from "../types";

// Dashboards are stored by the backend (shared by everyone on the team and part of the shared-data snapshot).
// The built-in demo dashboards below are fallbacks that appear until someone saves over them.
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

function seed(): Dashboard[] {
  const mk = (id: string, name: string, owner: string, ownership: Dashboard["ownership"], hours: number, pinned: boolean, status: Dashboard["status"]): Dashboard => ({
    id, name, owner, ownership, pinned, status, description: "", dataset_ids: [], widgets: [], created_at: ago(hours + 120), updated_at: ago(hours),
  });
  return [
    mk("revenue-overview", "Revenue Overview", "You", "owned", 2, true, "published"),
    mk("sales-performance", "Sales Performance", "Alex", "shared", 72, true, "published"),
    mk("customer-health", "Customer Health", "You", "owned", 24, false, "draft"),
    mk("marketing-attribution", "Marketing Attribution", "Sarah", "shared", 120, false, "published"),
    mk("executive-summary", "Executive Summary", "You", "owned", 144, false, "draft"),
    mk("product-adoption", "Product Adoption", "You", "owned", 168, false, "published"),
    mk("support-operations", "Support Operations", "Priya Nair", "shared", 192, false, "published"),
    mk("finance-forecast", "Finance Forecast", "You", "owned", 216, false, "published"),
    mk("inventory-supply", "Inventory & Supply", "Daniel Ortiz", "shared", 240, false, "published"),
  ];
}

const fromRecord = (record: DashboardRecordDto): Dashboard => record as unknown as Dashboard;

export async function listDashboards(): Promise<Dashboard[]> {
  let stored: Dashboard[] = [];
  try { stored = (await listDashboardRecords()).map(fromRecord); } catch { /* API unreachable: show the built-in demos only */ }
  const known = new Set(stored.map((item) => item.id));
  return [...stored, ...seed().filter((item) => !known.has(item.id))].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  try {
    return fromRecord(await getDashboardRecord(id));
  } catch (error) {
    if (error instanceof ApiError && error.status !== 404) throw error;
    return seed().find((item) => item.id === id) ?? null;
  }
}

export type DashboardInput = Pick<Dashboard, "name" | "description" | "dataset_ids" | "widgets"> & {
  id?: string; slicers?: string[]; status?: Dashboard["status"]; pinned?: boolean; refresh_minutes?: number; shares?: Array<{ user_id: string; role: "viewer" | "editor" }>;
};

export async function saveDashboard(input: DashboardInput): Promise<Dashboard> {
  const existing = input.id ? await getDashboard(input.id) : null;
  const saved = await saveDashboardRecord({
    id: existing?.id ?? input.id ?? `db-${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled dashboard",
    description: input.description.trim(),
    status: input.status ?? existing?.status ?? "draft",
    pinned: input.pinned ?? existing?.pinned ?? false,
    slicers: input.slicers ?? existing?.slicers ?? [],
    dataset_ids: input.dataset_ids,
    widgets: input.widgets,
    refresh_minutes: input.refresh_minutes ?? existing?.refresh_minutes ?? 0,
    shares: input.shares ?? existing?.shares?.map(({ user_id, role }) => ({ user_id, role })),
  });
  return fromRecord(saved);
}

export async function deleteDashboard(id: string): Promise<void> {
  await deleteDashboardRecord(id);
}
