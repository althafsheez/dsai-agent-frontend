import { MOCK_STORAGE_KEY, readMockEnvelope, updateMockEnvelope } from "@/lib/mock/mock-store";

export type LandingAttachmentKind = "dataset" | "artifact";

export interface LandingAttachmentMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: LandingAttachmentKind;
  origin: "uploaded";
}

export interface LandingFirstMessage {
  id: string;
  chatId: string;
  role: "user";
  content: string;
  status: "completed";
  createdAt: string;
  attachments: LandingAttachmentMetadata[];
}

export interface LandingMockChat {
  id: string;
  title: string;
  titleSource: "fallback";
  workspaceId: string | null;
  createdBy: "demo-user";
  createdAt: string;
  updatedAt: string;
  archivedAt: null;
  deletedAt: null;
  modelId: string;
  effort: string;
  messages: LandingFirstMessage[];
}

interface LandingMockState {
  version: 1;
  chats: LandingMockChat[];
}

export interface CreateLandingChatInput {
  content: string;
  workspaceId: string | null;
  modelId: string;
  effort: string;
  attachments: File[];
}

const DATASET_EXTENSIONS = new Set(["csv", "xls", "xlsx", "parquet"]);

function createId(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function attachmentKind(filename: string): LandingAttachmentKind {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return DATASET_EXTENSIONS.has(extension) ? "dataset" : "artifact";
}

function readState(): LandingMockState {
  const empty: LandingMockState = { version: 1, chats: [] };
  const envelope = readMockEnvelope();
  return Array.isArray(envelope.chats) ? { version: 1, chats: envelope.chats as LandingMockChat[] } : empty;
}

function fallbackTitle(content: string) {
  const compact = content.trim().replace(/\s+/g, " ");
  return compact.length > 50 ? `${compact.slice(0, 49).trimEnd()}…` : compact;
}

export function createLandingMockChat(input: CreateLandingChatInput): LandingMockChat {
  const content = input.content.trim();
  if (!content) throw new Error("Enter a question before starting an analysis.");

  const timestamp = new Date().toISOString();
  const chatId = createId("chat");
  const attachments = input.attachments.map<LandingAttachmentMetadata>((file) => ({
    id: createId("resource"),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    kind: attachmentKind(file.name),
    origin: "uploaded",
  }));
  const message: LandingFirstMessage = {
    id: createId("message"),
    chatId,
    role: "user",
    content,
    status: "completed",
    createdAt: timestamp,
    attachments,
  };
  const chat: LandingMockChat = {
    id: chatId,
    title: fallbackTitle(content),
    titleSource: "fallback",
    workspaceId: input.workspaceId,
    createdBy: "demo-user",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    deletedAt: null,
    modelId: input.modelId,
    effort: input.effort,
    messages: [message],
  };

  const state = readState();
  updateMockEnvelope((envelope) => ({ ...envelope, chats: [chat, ...state.chats] }));
  return chat;
}

export const landingMockStorage = {
  key: MOCK_STORAGE_KEY,
  read: readState,
};
