import type {
  ApiList,
  ChatDto,
  CreateChatResponse,
  ExecutionEvent,
  MessageDto,
  ModelsResponse,
  QueueRunInput,
  QueueRunResponse,
  RunStartInput,
  SteeringInstructionDto,
  WorkspaceDto,
} from "./types";
import type { ArtifactResource, DatasetResource } from "@/features/context-sidebar/types";

const API_ROOT = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");
const DEMO_USER_ID = "user-you";

interface ApiErrorBody {
  error?: { code?: string; message?: string; request_id?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "api_error",
  ) {
    super(message);
  }
}

function requestHeaders(json = false): HeadersInit {
  return {
    "X-Demo-User-Id": DEMO_USER_ID,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function apiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = await response.json() as ApiErrorBody;
  } catch {
    // A proxy or server may return a non-JSON failure.
  }
  return new ApiError(
    body?.error?.message ?? `Request failed with status ${response.status}.`,
    response.status,
    body?.error?.code,
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { ...requestHeaders(Boolean(init?.body)), ...init?.headers },
  });
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

export function getModels(): Promise<ModelsResponse> {
  return requestJson<ModelsResponse>("/models");
}

export function getWorkspaces(): Promise<ApiList<WorkspaceDto>> {
  return requestJson<ApiList<WorkspaceDto>>("/workspaces");
}

export function updateWorkspace(workspaceId: string, input: { name?: string; archived?: boolean }): Promise<WorkspaceDto> {
  return requestJson<WorkspaceDto>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    headers: requestHeaders(),
  });
  if (!response.ok) throw await apiError(response);
}

export function createWorkspace(input: { name: string; description?: string | null }): Promise<WorkspaceDto> {
  return requestJson<WorkspaceDto>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createChat(input: {
  workspace_id: string | null;
  content: string;
  client_request_id: string;
}): Promise<CreateChatResponse> {
  return requestJson<CreateChatResponse>("/chats", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getChats(): Promise<ApiList<ChatDto>> {
  return requestJson<ApiList<ChatDto>>("/chats");
}

export function updateChat(chatId: string, input: { title?: string; archived?: boolean }): Promise<ChatDto> {
  return requestJson<ChatDto>(`/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteChat(chatId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    headers: requestHeaders(),
  });
  if (!response.ok) throw await apiError(response);
}

export async function uploadResource(input: {
  file: File;
  scopeType: "chat" | "workspace";
  scopeId: string;
  messageId?: string;
  clientUploadId: string;
}): Promise<{ resource: { id: string; resource_type: "dataset" | "artifact"; name: string }; link_id: string }> {
  const body = new FormData();
  body.set("file", input.file);
  body.set("scope_type", input.scopeType);
  body.set("scope_id", input.scopeId);
  body.set("client_upload_id", input.clientUploadId);
  if (input.messageId) body.set("message_id", input.messageId);
  const response = await fetch(`${API_ROOT}/resources/upload`, { method: "POST", headers: requestHeaders(), body });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

export function getDatasets(chatId: string): Promise<ApiList<DatasetResource>> {
  return requestJson<ApiList<DatasetResource>>(`/datasets?chat_id=${encodeURIComponent(chatId)}`);
}

export function getArtifacts(chatId: string): Promise<ApiList<ArtifactResource>> {
  return requestJson<ApiList<ArtifactResource>>(`/artifacts?chat_id=${encodeURIComponent(chatId)}`);
}

export function getChat(chatId: string): Promise<ChatDto> {
  return requestJson<ChatDto>(`/chats/${encodeURIComponent(chatId)}`);
}

export function getMessages(chatId: string): Promise<ApiList<MessageDto>> {
  return requestJson<ApiList<MessageDto>>(`/chats/${encodeURIComponent(chatId)}/messages`);
}

export function createMessage(chatId: string, input: {
  content: string;
  client_request_id: string;
}): Promise<MessageDto> {
  return requestJson<MessageDto>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function queueRun(runId: string, input: QueueRunInput): Promise<QueueRunResponse> {
  return requestJson<QueueRunResponse>(`/runs/${encodeURIComponent(runId)}/queue`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function steerRun(runId: string, input: {
  content: string;
  client_request_id: string;
}): Promise<{ instruction: SteeringInstructionDto }> {
  return requestJson<{ instruction: SteeringInstructionDto }>(`/runs/${encodeURIComponent(runId)}/steer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelRun(runId: string, reason: "user" | "navigation" | "refresh" = "user"): Promise<{ run_id: string; status: string }> {
  return requestJson<{ run_id: string; status: string }>(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function cancelQueuedRun(runId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/runs/${encodeURIComponent(runId)}/queue`, {
    method: "DELETE",
    headers: requestHeaders(),
  });
  if (!response.ok) throw await apiError(response);
}

export function createSseParser(onEvent: (event: ExecutionEvent) => void) {
  let lineBuffer = "";
  let dataLines: string[] = [];

  function dispatch() {
    if (!dataLines.length) return;
    const payload = JSON.parse(dataLines.join("\n")) as ExecutionEvent;
    onEvent(payload);
    dataLines = [];
  }

  return {
    push(chunk: string) {
      lineBuffer += chunk;
      let newline = lineBuffer.indexOf("\n");
      while (newline >= 0) {
        let line = lineBuffer.slice(0, newline);
        lineBuffer = lineBuffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line) dispatch();
        else if (!line.startsWith(":")) {
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          let value = separator < 0 ? "" : line.slice(separator + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "data") dataLines.push(value);
        }
        newline = lineBuffer.indexOf("\n");
      }
    },
    finish() {
      if (lineBuffer) {
        const line = lineBuffer.endsWith("\r") ? lineBuffer.slice(0, -1) : lineBuffer;
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      dispatch();
      lineBuffer = "";
    },
  };
}

export async function streamChatRun(
  chatId: string,
  input: RunStartInput,
  onEvent: (event: ExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_ROOT}/chats/${encodeURIComponent(chatId)}/messages/stream`,
    {
      method: "POST",
      headers: requestHeaders(true),
      body: JSON.stringify(input),
      signal,
    },
  );
  if (!response.ok) throw await apiError(response);
  if (!response.body) throw new ApiError("The streaming response had no body.", 502, "empty_stream");

  const parser = createSseParser(onEvent);
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.finish();
}

export async function resumeChatQueue(
  chatId: string,
  onEvent: (event: ExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_ROOT}/chats/${encodeURIComponent(chatId)}/queue/resume/stream`,
    { method: "POST", headers: requestHeaders(), signal },
  );
  if (!response.ok) throw await apiError(response);
  if (!response.body) throw new ApiError("The streaming response had no body.", 502, "empty_stream");

  const parser = createSseParser(onEvent);
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.finish();
}
