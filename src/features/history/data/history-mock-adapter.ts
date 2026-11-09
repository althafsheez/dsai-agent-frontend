import { currentDemoUser, type HistoryFilterOptions, type HistoryRecord } from "../types";
import { MOCK_STORAGE_KEY, readMockEnvelope, writeMockEnvelope } from "@/lib/mock/mock-store";
import type { LandingMockChat } from "@/features/landing/mock-first-send";

interface HistoryEnvelope { records: HistoryRecord[] }

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedRecords(): HistoryRecord[] {
  return [
    { kind: "chat", id: "revenue-analysis", name: "Revenue Analysis", workspace_id: "research", workspace_name: "Research", author: currentDemoUser, updated_at: hoursAgo(2), archived_at: null, deleted_at: null },
    { kind: "chat", id: "sales-report", name: "Sales Report", workspace_id: null, workspace_name: null, author: { id: "user-anita", name: "Anita" }, updated_at: hoursAgo(25), archived_at: null, deleted_at: null },
    { kind: "workspace", id: "project-alpha", name: "Project Alpha", workspace_id: null, workspace_name: null, author: currentDemoUser, updated_at: hoursAgo(49), archived_at: null, deleted_at: null },
    { kind: "workspace", id: "research", name: "Research", workspace_id: null, workspace_name: null, author: currentDemoUser, updated_at: hoursAgo(96), archived_at: null, deleted_at: null },
    { kind: "chat", id: "retention-cohorts", name: "Retention Cohorts", workspace_id: "research", workspace_name: "Research", author: { id: "user-maya", name: "Maya" }, updated_at: hoursAgo(168), archived_at: null, deleted_at: null },
    { kind: "chat", id: "q3-forecast", name: "Q3 Forecast", workspace_id: "project-alpha", workspace_name: "Project Alpha", author: currentDemoUser, updated_at: hoursAgo(240), archived_at: hoursAgo(72), deleted_at: null },
    { kind: "workspace", id: "market-research", name: "Market Research", workspace_id: null, workspace_name: null, author: { id: "user-anita", name: "Anita" }, updated_at: hoursAgo(360), archived_at: hoursAgo(120), deleted_at: null },
  ];
}

function isRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HistoryRecord>;
  return (record.kind === "chat" || record.kind === "workspace")
    && typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.updated_at === "string"
    && !!record.author
    && typeof record.author.id === "string"
    && typeof record.author.name === "string";
}

function readRecords(): HistoryRecord[] {
  const envelope = readMockEnvelope();
  const history = envelope.history as HistoryEnvelope | undefined;
  const records = history?.records;
  if (Array.isArray(records) && records.every(isRecord)) return records;
  const seeded = seedRecords();
  writeRecords(seeded, envelope);
  return seeded;
}

function writeRecords(records: HistoryRecord[], base = readMockEnvelope()): void {
  if (typeof window === "undefined") return;
  writeMockEnvelope({ ...base, history: { records } });
}

function landingHistoryRecords(): HistoryRecord[] {
  const envelope = readMockEnvelope();
  if (!Array.isArray(envelope.chats)) return [];
  return (envelope.chats as LandingMockChat[]).map((chat) => ({
    kind: "chat",
    id: chat.id,
    name: chat.title,
    workspace_id: chat.workspaceId,
    workspace_name: chat.workspaceId === "workspace-revenue" ? "Revenue Planning" : chat.workspaceId === "workspace-research" ? "Customer Research" : null,
    author: currentDemoUser,
    updated_at: chat.updatedAt,
    archived_at: chat.archivedAt,
    deleted_at: chat.deletedAt,
  }));
}

function visibleRecords(records: HistoryRecord[]): HistoryRecord[] {
  const deletedWorkspaceIds = new Set(records.filter((record) => record.kind === "workspace" && record.deleted_at).map((record) => record.id));
  return records.filter((record) => !record.deleted_at && !(record.kind === "chat" && record.workspace_id && deletedWorkspaceIds.has(record.workspace_id)));
}

export const historyMockAdapter = {
  storageKey: MOCK_STORAGE_KEY,

  async list(): Promise<HistoryRecord[]> {
    const persisted = readRecords();
    const landing = landingHistoryRecords();
    const landingIds = new Set(landing.map((record) => record.id));
    return visibleRecords([...landing, ...persisted.filter((record) => !landingIds.has(record.id))]);
  },

  async options(): Promise<HistoryFilterOptions> {
    const records = visibleRecords(readRecords());
    const authorMap = new Map(records.map((record) => [record.author.id, record.author]));
    const workspaces = records
      .filter((record) => record.kind === "workspace")
      .map((record) => ({ id: record.id, name: record.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { authors: [...authorMap.values()].sort((a, b) => a.name.localeCompare(b.name)), workspaces };
  },

  async rename(id: string, kind: HistoryRecord["kind"], name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Name is required");
    const records = readRecords();
    const updatedAt = new Date().toISOString();
    writeRecords(records.map((record) => {
      if (record.id === id && record.kind === kind) return { ...record, name: trimmedName, updated_at: updatedAt };
      if (kind === "workspace" && record.workspace_id === id) return { ...record, workspace_name: trimmedName };
      return record;
    }));
  },

  async setArchived(id: string, kind: HistoryRecord["kind"], archived: boolean): Promise<void> {
    const records = readRecords();
    writeRecords(records.map((record) => record.id === id && record.kind === kind
      ? { ...record, archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
      : record));
  },

  async softDelete(id: string, kind: HistoryRecord["kind"]): Promise<void> {
    const records = readRecords();
    writeRecords(records.map((record) => record.id === id && record.kind === kind
      ? { ...record, deleted_at: new Date().toISOString() }
      : record));
  },
};
