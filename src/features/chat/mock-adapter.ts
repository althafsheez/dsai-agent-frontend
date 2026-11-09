import { readMockEnvelope } from "@/lib/mock/mock-store";
import type { ArtifactResource, ContextFile, DatasetResource } from "@/features/context-sidebar";
import type { LandingAttachmentMetadata, LandingMockChat } from "@/features/landing/mock-first-send";
import { createMockChat } from "./mock-data";
import type { ChatRecord } from "./types";
import { updateMockEnvelope } from "@/lib/mock/mock-store";

export interface MockChatView {
  chat: ChatRecord;
  datasets: DatasetResource[];
  artifacts: ArtifactResource[];
}

const columns = [
  { name: "customer_id", data_type: "Integer" },
  { name: "revenue", data_type: "Float" },
  { name: "date", data_type: "Date" },
];

const seededDatasets: DatasetResource[] = [
  {
    id: "workspace-sales",
    name: "Sales.csv",
    mime_type: "text/csv",
    size_bytes: 245_760,
    origin: "uploaded",
    preview_url: "/mock/sales-preview",
    download_url: "#download-sales",
    created_by: "user-you",
    created_at: "2026-11-08T10:00:00.000Z",
    row_count: 2500,
    column_count: 3,
    columns,
    preview_rows: [["C-001", 1200, "2026-10-01"], ["C-002", 1500, "2026-10-02"], ["C-003", 980, "2026-10-03"]],
    scope_type: "workspace",
    run_id: null,
  },
  {
    id: "file-1",
    name: "regional_growth_summary.csv",
    mime_type: "text/csv",
    size_bytes: 12_288,
    origin: "generated",
    preview_url: "/mock/regional-growth-preview",
    download_url: "#download-regional-growth",
    created_by: "user-you",
    created_at: "2026-11-09T09:30:12.000Z",
    row_count: 4,
    column_count: 4,
    columns: [
      { name: "region", data_type: "String" },
      { name: "revenue", data_type: "Currency" },
      { name: "yoy_growth", data_type: "Float" },
      { name: "contribution", data_type: "Float" },
    ],
    preview_rows: [["North America", "$18.4M", "16.2%", "48%"], ["APAC", "$11.6M", "21.8%", "30%"], ["EMEA", "$7.9M", "2.1%", "12%"], ["LATAM", "$4.1M", "8.4%", "10%"]],
    scope_type: "chat",
    run_id: "run-1",
  },
];

const seededArtifacts: ArtifactResource[] = [
  {
    id: "artifact-report",
    name: "Revenue analysis.pdf",
    mime_type: "application/pdf",
    size_bytes: 428_000,
    origin: "generated",
    preview_url: null,
    download_url: "#download-report",
    kind: "pdf",
    created_by: "user-you",
    created_at: "2026-11-09T09:31:00.000Z",
    run_id: "run-1",
    saved: false,
  },
  {
    id: "artifact-chart",
    name: "Revenue forecast chart.png",
    mime_type: "image/png",
    size_bytes: 96_000,
    origin: "generated",
    preview_url: null,
    download_url: "#download-chart",
    kind: "chart",
    created_by: "user-you",
    created_at: "2026-11-09T09:30:40.000Z",
    run_id: "run-1",
    saved: true,
  },
];

function landingChat(chatId: string): LandingMockChat | undefined {
  const chats = readMockEnvelope().chats;
  return Array.isArray(chats) ? (chats as LandingMockChat[]).find((chat) => chat.id === chatId) : undefined;
}

function storedSession(chatId: string): ChatRecord | undefined {
  const sessions = readMockEnvelope().chatSessions;
  if (!Array.isArray(sessions)) return undefined;
  return (sessions as ChatRecord[]).find((chat) => chat.id === chatId);
}

function fileSize(sizeBytes: number): string {
  return sizeBytes < 1024 ** 2 ? `${Math.max(1, Math.round(sizeBytes / 1024))} KB` : `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
}

function toResource(attachment: LandingAttachmentMetadata, scope: "workspace" | "chat"): ContextFile {
  const common = {
    id: attachment.id,
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    origin: attachment.origin,
    preview_url: null,
    download_url: "#mock-download",
    created_by: "user-you",
    created_at: new Date().toISOString(),
    run_id: null,
  } as const;
  if (attachment.kind === "dataset") return { ...common, row_count: null, column_count: null, scope_type: scope };
  const kind: ArtifactResource["kind"] = attachment.mimeType.startsWith("image/") ? "image" : attachment.mimeType === "application/pdf" ? "pdf" : "file";
  return { ...common, kind, saved: false };
}

export const chatMockAdapter = {
  get(chatId: string): MockChatView {
    const persisted = landingChat(chatId);
    const session = storedSession(chatId);
    if (!persisted) return { chat: session ?? createMockChat(chatId), datasets: seededDatasets, artifacts: seededArtifacts };

    const attachments = persisted.messages.flatMap((message) => message.attachments);
    const resources = attachments.map((attachment) => toResource(attachment, "chat"));
    const chat: ChatRecord = {
      id: persisted.id,
      title: persisted.title,
      workspace: persisted.workspaceId ? { id: persisted.workspaceId, name: persisted.workspaceId === "workspace-revenue" ? "Revenue Planning" : "Customer Research" } : null,
      messages: persisted.messages.map((message) => ({
        id: message.id,
        role: "user" as const,
        content: message.content,
        createdAt: message.createdAt,
        attachments: message.attachments.map((attachment) => ({ id: attachment.id, name: attachment.name, kind: attachment.kind === "dataset" ? "Dataset" : "Artifact", size: fileSize(attachment.sizeBytes) })),
      })),
    };
    return {
      chat: session ?? chat,
      datasets: resources.filter((resource): resource is DatasetResource => "scope_type" in resource),
      artifacts: resources.filter((resource): resource is ArtifactResource => "kind" in resource),
    };
  },

  save(chat: ChatRecord): void {
    updateMockEnvelope((envelope) => {
      const sessions = Array.isArray(envelope.chatSessions) ? envelope.chatSessions as ChatRecord[] : [];
      return { ...envelope, chatSessions: [chat, ...sessions.filter((session) => session.id !== chat.id)] };
    });
  },
};
