import { describe, expect, it } from "vitest";
import { filterHistory } from "./filter-history";
import type { HistoryFilters, HistoryRecord } from "../types";

const now = Date.parse("2026-11-09T12:00:00.000Z");
const records: HistoryRecord[] = [
  { kind: "chat", id: "1", name: "Revenue Analysis", workspace_id: "w1", workspace_name: "Research", author: { id: "user-you", name: "You" }, updated_at: "2026-11-09T10:00:00.000Z", archived_at: null, deleted_at: null },
  { kind: "chat", id: "2", name: "Sales Report", workspace_id: null, workspace_name: null, author: { id: "user-anita", name: "Anita" }, updated_at: "2026-11-07T10:00:00.000Z", archived_at: null, deleted_at: null },
  { kind: "workspace", id: "w1", name: "Research", workspace_id: null, workspace_name: null, author: { id: "user-you", name: "You" }, updated_at: "2026-11-01T10:00:00.000Z", archived_at: "2026-11-02T10:00:00.000Z", deleted_at: null },
];

const defaults: HistoryFilters = { ownership: "owned", status: "active", search: "", time: "any", authorId: "all", workspaceId: "all", sort: "updated_desc" };

describe("filterHistory", () => {
  it("searches and applies ownership, status, author and workspace filters", () => {
    expect(filterHistory(records, defaults, now).map((record) => record.id)).toEqual(["1"]);
    expect(filterHistory(records, { ...defaults, ownership: "all", search: "Anita" }, now).map((record) => record.id)).toEqual(["2"]);
    expect(filterHistory(records, { ...defaults, status: "archived", workspaceId: "w1" }, now).map((record) => record.id)).toEqual(["w1"]);
    expect(filterHistory(records, { ...defaults, ownership: "all", authorId: "user-anita", workspaceId: "standalone" }, now).map((record) => record.id)).toEqual(["2"]);
  });

  it("filters by time and sorts", () => {
    expect(filterHistory(records, { ...defaults, ownership: "all", time: "day" }, now).map((record) => record.id)).toEqual(["1"]);
    expect(filterHistory(records, { ...defaults, ownership: "all", sort: "name_asc" }, now).map((record) => record.name)).toEqual(["Revenue Analysis", "Sales Report"]);
  });
});

