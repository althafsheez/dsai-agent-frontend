import { currentDemoUser, type HistoryFilterOptions, type HistoryRecord } from "../types";

const STORAGE_KEY = "dsai.mock.data.v1";

interface MockEnvelope {
  version: 1;
  history?: { records: HistoryRecord[] };
  [key: string]: unknown;
}

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

function readEnvelope(): MockEnvelope {
  if (typeof window === "undefined") return { version: 1, history: { records: seedRecords() } };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1 };
    const parsed = JSON.parse(raw) as MockEnvelope;
    return parsed && parsed.version === 1 ? parsed : { version: 1 };
  } catch {
    return { version: 1 };
  }
}

function readRecords(): HistoryRecord[] {
  const envelope = readEnvelope();
  const records = envelope.history?.records;
  if (Array.isArray(records) && records.every(isRecord)) return records;
  const seeded = seedRecords();
  writeRecords(seeded, envelope);
  return seeded;
}

function writeRecords(records: HistoryRecord[], base = readEnvelope()): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, version: 1, history: { records } } satisfies MockEnvelope));
}

function visibleRecords(records: HistoryRecord[]): HistoryRecord[] {
  const deletedWorkspaceIds = new Set(records.filter((record) => record.kind === "workspace" && record.deleted_at).map((record) => record.id));
  return records.filter((record) => !record.deleted_at && !(record.kind === "chat" && record.workspace_id && deletedWorkspaceIds.has(record.workspace_id)));
}

export const historyMockAdapter = {
  storageKey: STORAGE_KEY,

  async list(): Promise<HistoryRecord[]> {
    return visibleRecords(readRecords());
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

