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

const STORAGE_KEY = "dsai:landing-mock-chats:v1";
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
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("chats" in parsed) ||
      !Array.isArray(parsed.chats)
    ) return empty;
    return parsed as LandingMockState;
  } catch {
    return empty;
  }
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, chats: [chat, ...state.chats] }));
  return chat;
}

export const landingMockStorage = {
  key: STORAGE_KEY,
  read: readState,
};
