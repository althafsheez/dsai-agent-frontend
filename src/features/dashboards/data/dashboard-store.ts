import { readMockEnvelope, updateMockEnvelope } from "@/lib/mock/mock-store";
import type { Dashboard } from "../types";

// Demo store: dashboards live in the shared mock envelope until a dashboards API exists.
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

function read(): Dashboard[] {
  const stored = readMockEnvelope().dashboardDemo as Dashboard[] | undefined;
  if (Array.isArray(stored)) return stored;
  const seeded = seed();
  write(seeded);
  return seeded;
}

function write(value: Dashboard[]) {
  try { updateMockEnvelope((current) => ({ ...current, dashboardDemo: value })); } catch { /* storage unavailable: demo works per session */ }
}

export async function listDashboards(): Promise<Dashboard[]> {
  return [...read()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  return read().find((item) => item.id === id) ?? seed().find((item) => item.id === id) ?? null;
}

export type DashboardInput = Pick<Dashboard, "name" | "description" | "dataset_ids" | "widgets"> & { id?: string; status?: Dashboard["status"]; pinned?: boolean };

export async function saveDashboard(input: DashboardInput): Promise<Dashboard> {
  const all = read();
  const existing = input.id ? all.find((item) => item.id === input.id) ?? seed().find((item) => item.id === input.id) : undefined;
  const now = new Date().toISOString();
  const saved: Dashboard = {
    id: existing?.id ?? `db-${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled dashboard",
    description: input.description.trim(),
    owner: existing?.owner ?? "You",
    ownership: existing?.ownership ?? "owned",
    status: input.status ?? existing?.status ?? "draft",
    pinned: input.pinned ?? existing?.pinned ?? false,
    dataset_ids: input.dataset_ids,
    widgets: input.widgets,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  write(all.some((item) => item.id === saved.id) ? all.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...all]);
  return saved;
}

export async function deleteDashboard(id: string): Promise<void> {
  write(read().filter((item) => item.id !== id));
}
