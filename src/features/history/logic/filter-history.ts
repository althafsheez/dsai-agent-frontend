import { currentDemoUser, type HistoryFilters, type HistoryRecord, type HistoryTime } from "../types";

const timeHours: Record<Exclude<HistoryTime, "any">, number> = {
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
  quarter: 24 * 90,
};

export function filterHistory(records: HistoryRecord[], filters: HistoryFilters, now = Date.now()): HistoryRecord[] {
  const query = filters.search.trim().toLocaleLowerCase();
  const cutoff = filters.time === "any" ? null : now - timeHours[filters.time] * 60 * 60 * 1000;

  return records
    .filter((record) => filters.ownership === "all" || record.author.id === currentDemoUser.id)
    .filter((record) => filters.status === "archived" ? !!record.archived_at : !record.archived_at)
    .filter((record) => !query || [record.name, record.workspace_name ?? "Standalone", record.author.name]
      .some((value) => value.toLocaleLowerCase().includes(query)))
    .filter((record) => filters.authorId === "all" || record.author.id === filters.authorId)
    .filter((record) => filters.workspaceId === "all"
      || (filters.workspaceId === "standalone" ? record.kind === "chat" && record.workspace_id === null : record.workspace_id === filters.workspaceId || (record.kind === "workspace" && record.id === filters.workspaceId)))
    .filter((record) => cutoff === null || new Date(record.updated_at).getTime() >= cutoff)
    .sort((a, b) => {
      if (filters.sort === "name_asc") return a.name.localeCompare(b.name);
      const delta = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return filters.sort === "updated_asc" ? delta : -delta;
    });
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

