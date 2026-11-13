export type ChatStatus = "completed" | "running" | "failed" | "interrupted";

export type TraceStep = {
  id: string;
  runId: string;
  messageId: string;
  label: string;
  summary?: string;
  detail?: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputs?: TraceResourceReference[];
  outputs?: TraceResourceReference[];
  code?: string;
  sql?: string;
  results?: unknown;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type TraceResourceReference = {
  id: string;
  name: string;
  resourceType: "dataset" | "artifact";
  sizeBytes?: number;
};

export type ChartDatum = Record<string, string | number>;

export type MessageBlock =
  | { type: "markdown"; content: string }
  | { type: "code"; code: string; language: string; filename?: string }
  | { type: "table"; columns: string[]; rows: Array<Array<string | number>>; caption?: string }
  | { type: "chart"; title: string; description: string; data: ChartDatum[]; xKey: string; series: Array<{ key: string; label: string; color: string }> }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "file"; id: string; name: string; kind: string; size: string; description?: string };

export type UserMessage = {
  id: string;
  role: "user";
  content: string;
  createdAt: string;
  attachments?: Array<{ id: string; name: string; kind: string; size: string }>;
};

export type AssistantMessage = {
  id: string;
  role: "assistant";
  blocks: MessageBlock[];
  createdAt: string;
  status: ChatStatus;
  trace?: TraceStep[];
  retryOf?: string;
};

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatRecord = {
  id: string;
  title: string;
  workspace: null | { id: string; name: string };
  messages: ChatMessage[];
};

export type PendingAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
};

export type RunMode = "send" | "queue" | "steer";
