export type HistoryKind = "chat" | "workspace";
export type HistoryOwnership = "owned" | "all";
export type HistoryStatus = "active" | "archived";
export type HistorySort = "updated_desc" | "updated_asc" | "name_asc";
export type HistoryTime = "any" | "day" | "week" | "month" | "quarter";

export interface HistoryAuthor {
  id: string;
  name: string;
}

export interface HistoryRecord {
  kind: HistoryKind;
  id: string;
  name: string;
  workspace_id: string | null;
  workspace_name: string | null;
  author: HistoryAuthor;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface HistoryFilters {
  ownership: HistoryOwnership;
  status: HistoryStatus;
  search: string;
  time: HistoryTime;
  authorId: string;
  workspaceId: string;
  sort: HistorySort;
}

export interface HistoryFilterOptions {
  authors: HistoryAuthor[];
  workspaces: Array<{ id: string; name: string }>;
}

export const currentDemoUser: HistoryAuthor = { id: "user-you", name: "You" };

