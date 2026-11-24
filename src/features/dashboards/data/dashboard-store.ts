import { ApiError, deleteDashboardRecord, getDashboardRecord, listDashboardRecords, pinDashboardRecord, saveDashboardRecord } from "@/lib/api";
import type { DashboardRecordDto } from "@/lib/api";
import type { Dashboard } from "../types";

// Dashboards are stored by the backend (shared by everyone on the team and part of the shared-data snapshot).
const fromRecord = (record: DashboardRecordDto): Dashboard => record as unknown as Dashboard;

export async function listDashboards(): Promise<Dashboard[]> {
  return (await listDashboardRecords()).map(fromRecord).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  try {
    return fromRecord(await getDashboardRecord(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export type DashboardInput = Pick<Dashboard, "name" | "description" | "dataset_ids" | "widgets"> & {
  id?: string; slicers?: string[]; measures?: Dashboard["measures"]; status?: Dashboard["status"]; pinned?: boolean; refresh_minutes?: number; shares?: Array<{ user_id: string; role: "viewer" | "editor" }>;
};

export async function saveDashboard(input: DashboardInput): Promise<Dashboard> {
  const existing = input.id ? await getDashboard(input.id) : null;
  const saved = await saveDashboardRecord({
    id: existing?.id ?? input.id ?? `db-${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled dashboard",
    description: input.description.trim(),
    status: input.status ?? existing?.status ?? "draft",
    pinned: input.pinned,
    slicers: input.slicers ?? existing?.slicers ?? [],
    dataset_ids: input.dataset_ids,
    widgets: input.widgets,
    measures: input.measures,
    refresh_minutes: input.refresh_minutes ?? existing?.refresh_minutes ?? 0,
    shares: input.shares ?? existing?.shares?.map(({ user_id, role }) => ({ user_id, role })),
  });
  return fromRecord(saved);
}

export async function deleteDashboard(id: string): Promise<void> {
  await deleteDashboardRecord(id);
}

export async function pinDashboard(id: string, pinned: boolean): Promise<Dashboard> {
  return fromRecord(await pinDashboardRecord(id, pinned));
}

/** A private copy owned by the signed-in user: same charts and data, no sharing, saved as a draft. */
export async function duplicateDashboard(source: Dashboard): Promise<Dashboard> {
  return saveDashboard({
    name: `Copy of ${source.name}`.slice(0, 160), description: source.description, slicers: source.slicers, dataset_ids: source.dataset_ids,
    widgets: source.widgets, measures: source.measures, status: "draft", refresh_minutes: source.refresh_minutes, shares: [],
  });
}
