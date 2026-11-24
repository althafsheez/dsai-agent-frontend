import type {
  ApiList,
  ChatDto,
  CreateChatResponse,
  ExecutionEvent,
  AgentRunDto,
  MessageDto,
  QuickMessageDto,
  ModelsResponse,
  QueueRunInput,
  QueueRunResponse,
  PostgresConnection,
  PostgresConnectionInput,
  PostgresSchemaList,
  PostgresTable,
  PostgresTableDetails,
  RunStartInput,
  SteeringInstructionDto,
  WorkspaceDto,
  WorkspaceContextFileDto,
  WorkspaceInviteDto,
  WorkspaceRole,
  WorkflowDto,
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
    readonly requestId?: string,
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

/** Resolve an API-relative resource URL through the same API boundary as JSON requests. */
function resourceUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const apiPath = path.replace(/^\/api(?=\/|$)/, "");
  return `${API_ROOT}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
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
    typeof body?.error?.request_id === "string" && /^[0-9a-f-]{36}$/i.test(body.error.request_id)
      ? body.error.request_id
      : undefined,
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


export function getPostgresConnections(scope?: { chatId?: string; workspaceId?: string | null }): Promise<{ items: PostgresConnection[] }> {
  const params = new URLSearchParams();
  if (scope) params.set("for_analysis", "true");
  if (scope?.chatId) params.set("chat_id", scope.chatId);
  if (scope?.workspaceId) params.set("workspace_id", scope.workspaceId);
  return requestJson(`/connectors${params.size ? `?${params}` : ""}`);
}

const connectionPath = (id: string) => `/connectors/${encodeURIComponent(id)}`;

export function testPostgresConnection(input: PostgresConnectionInput, id?: string): Promise<{ schemas: PostgresSchemaList }> {
  return requestJson(id ? `${connectionPath(id)}/test` : "/connectors/postgresql/test", {
    method: "POST", body: JSON.stringify(input),
  });
}

export function savePostgresConnection(input: PostgresConnectionInput, id?: string): Promise<PostgresConnection> {
  return requestJson(id ? connectionPath(id) : "/connectors", {
    method: id ? "PATCH" : "POST", body: JSON.stringify(input),
  });
}

export async function disconnectPostgres(id: string): Promise<void> {
  const response = await fetch(`${API_ROOT}${connectionPath(id)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}

export function getPostgresSchemas(id: string): Promise<PostgresSchemaList> {
  return requestJson(`${connectionPath(id)}/schemas`);
}

export function refreshPostgresSchema(id: string): Promise<PostgresSchemaList> {
  return requestJson(`${connectionPath(id)}/refresh-schema`, { method: "POST" });
}

export function getPostgresTables(id: string, schema: string, search: string): Promise<{ items: PostgresTable[]; truncated: boolean }> {
  const params = new URLSearchParams({ search, ...(schema ? { schema } : {}) });
  return requestJson(`${connectionPath(id)}/tables?${params}`);
}

export function getPostgresTable(id: string, schema: string, table: string, preview: boolean): Promise<PostgresTableDetails> {
  return requestJson(`${connectionPath(id)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}?preview=${preview}`);
}

export function getModels(): Promise<ModelsResponse> {
  return requestJson<ModelsResponse>("/models");
}

export function getWorkspaces(): Promise<ApiList<WorkspaceDto>> {
  return requestJson<ApiList<WorkspaceDto>>("/workspaces");
}

export function getWorkspace(workspaceId: string): Promise<WorkspaceDto> {
  return requestJson<WorkspaceDto>(`/workspaces/${encodeURIComponent(workspaceId)}`);
}

export function getWorkspaceChats(workspaceId: string): Promise<ApiList<ChatDto>> {
  return requestJson<ApiList<ChatDto>>(`/workspaces/${encodeURIComponent(workspaceId)}/chats`);
}

export function getWorkspaceContextFiles(workspaceId: string): Promise<ApiList<WorkspaceContextFileDto>> {
  return requestJson<ApiList<WorkspaceContextFileDto>>(`/workspaces/${encodeURIComponent(workspaceId)}/context-files`);
}

export function getWorkspaceInvites(workspaceId: string): Promise<ApiList<WorkspaceInviteDto>> {
  return requestJson<ApiList<WorkspaceInviteDto>>(`/workspaces/${encodeURIComponent(workspaceId)}/invites`);
}

export function inviteToWorkspace(workspaceId: string, input: { email: string; role: WorkspaceRole }): Promise<WorkspaceInviteDto> {
  return requestJson<WorkspaceInviteDto>(`/workspaces/${encodeURIComponent(workspaceId)}/invites`, { method: "POST", body: JSON.stringify(input) });
}

export function updateWorkspaceInvite(workspaceId: string, inviteId: string, role: WorkspaceRole): Promise<WorkspaceInviteDto> {
  return requestJson<WorkspaceInviteDto>(`/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export async function removeWorkspaceInvite(workspaceId: string, inviteId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}

export function getWorkspaceWorkflows(workspaceId: string): Promise<ApiList<WorkflowDto>> {
  return requestJson<ApiList<WorkflowDto>>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows`);
}

export function createWorkspaceWorkflow(workspaceId: string, input: { name: string; description?: string | null }): Promise<WorkflowDto> {
  return requestJson<WorkflowDto>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows`, { method: "POST", body: JSON.stringify(input) });
}

export function linkWorkspaceWorkflowChat(workspaceId: string, workflowId: string, chatId: string): Promise<{ workflow_id: string; chat_id: string; relation_type: string }> {
  return requestJson(`/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/chats`, { method: "POST", body: JSON.stringify({ chat_id: chatId, relation_type: "referenced" }) });
}

export function createWorkspaceContextFile(workspaceId: string, input: { name: string; content: string }): Promise<WorkspaceContextFileDto> {
  return requestJson<WorkspaceContextFileDto>(`/workspaces/${encodeURIComponent(workspaceId)}/context-files`, { method: "POST", body: JSON.stringify(input) });
}

export function updateWorkspaceContextFile(workspaceId: string, fileId: string, input: { name?: string; content?: string }): Promise<WorkspaceContextFileDto> {
  return requestJson<WorkspaceContextFileDto>(`/workspaces/${encodeURIComponent(workspaceId)}/context-files/${encodeURIComponent(fileId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteWorkspaceContextFile(workspaceId: string, fileId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/workspaces/${encodeURIComponent(workspaceId)}/context-files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}

export function updateWorkspace(workspaceId: string, input: { name?: string; description?: string | null; archived?: boolean; pinned?: boolean }): Promise<WorkspaceDto> {
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

export function createWorkspace(input: { name: string; description?: string | null; ai_context?: string | null }): Promise<WorkspaceDto> {
  return requestJson<WorkspaceDto>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createChat(input: {
  workspace_id: string | null;
  content: string;
  client_request_id: string;
  connection_ids?: string[];
}): Promise<CreateChatResponse> {
  return requestJson<CreateChatResponse>("/chats", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getChats(): Promise<ApiList<ChatDto>> {
  return requestJson<ApiList<ChatDto>>("/chats");
}

export function getActivity(): Promise<ApiList<ChatDto>> {
  return requestJson<ApiList<ChatDto>>("/chats/activity/list");
}

export function updateChat(chatId: string, input: { title?: string; workspace_id?: string | null; archived?: boolean; pinned?: boolean; is_unread?: boolean }): Promise<ChatDto> {
  return requestJson<ChatDto>(`/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function setChatPresence(chatId: string, viewing: boolean): Promise<void> {
  const response = await fetch(`${API_ROOT}/chats/${encodeURIComponent(chatId)}/presence`, {
    method: "POST",
    headers: requestHeaders(true),
    body: JSON.stringify({ viewing }),
    keepalive: !viewing,
  });
  if (!response.ok) throw await apiError(response);
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

export function downloadWorkspaceDatasets(workspaceId: string, workspaceName: string): Promise<void> {
  return downloadResource(`/workspaces/${encodeURIComponent(workspaceId)}/datasets/download`, `${workspaceName}-datasets.zip`);
}

export function getWorkspaceDatasets(workspaceId: string): Promise<ApiList<DatasetResource>> {
  return requestJson<ApiList<DatasetResource>>(`/datasets?workspace_id=${encodeURIComponent(workspaceId)}`);
}

export function getArtifacts(chatId: string): Promise<ApiList<ArtifactResource>> {
  return requestJson<ApiList<ArtifactResource>>(`/artifacts?chat_id=${encodeURIComponent(chatId)}`);
}

export type LibraryCategory = "dataset" | "visual" | "code" | "report" | "other";

/** A saved resource retains its dataset/artifact discriminator for preview rendering. */
type LibraryFields = {
  library_category: LibraryCategory;
  library_created_at: string;
  /** The live workspace the file belongs to, directly or through a workspace chat; null for standalone chats. */
  workspace_id: string | null;
  workspace_name: string | null;
};

export type LibraryResource =
  | (DatasetResource & LibraryFields & { resource_type: "dataset" })
  | (ArtifactResource & LibraryFields & { resource_type: "artifact" });

export function getLibrary(): Promise<ApiList<LibraryResource>> {
  return requestJson<ApiList<LibraryResource>>("/library");
}

export function addResourceToLibrary(resourceId: string): Promise<{ resource_id: string; in_library: boolean; library_entry_id: string }> {
  return requestJson(`/resources/${encodeURIComponent(resourceId)}/library`, { method: "POST" });
}

export async function removeResourceFromLibrary(resourceId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/resources/${encodeURIComponent(resourceId)}/library`, {
    method: "DELETE",
    headers: requestHeaders(),
  });
  if (!response.ok) throw await apiError(response);
}

export async function getResourcePreview(url: string): Promise<Blob> {
  const response = await fetch(resourceUrl(url), { headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

/** Read a bounded text/code preview from the same authorized resource endpoint. */
export async function getResourcePreviewText(url: string): Promise<string> {
  const response = await fetch(resourceUrl(url), { headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
  return response.text();
}

export async function downloadResource(url: string, filename: string): Promise<void> {
  const blob = await getResourcePreview(url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function getChat(chatId: string): Promise<ChatDto> {
  return requestJson<ChatDto>(`/chats/${encodeURIComponent(chatId)}`);
}

export function getMessages(chatId: string): Promise<ApiList<MessageDto>> {
  return requestJson<ApiList<MessageDto>>(`/chats/${encodeURIComponent(chatId)}/messages`);
}

export function getQuickAssistantMessages(contextType: "chat" | "workspace", contextId: string): Promise<ApiList<QuickMessageDto>> {
  return requestJson<ApiList<QuickMessageDto>>(`/quick-assistant/messages?context_type=${contextType}&context_id=${encodeURIComponent(contextId)}`);
}

export function getChatRuns(chatId: string): Promise<ApiList<AgentRunDto>> {
  return requestJson<ApiList<AgentRunDto>>(`/chats/${encodeURIComponent(chatId)}/runs`);
}

export function getRunEvents(runId: string, afterSequence = 0): Promise<ApiList<ExecutionEvent>> {
  return requestJson<ApiList<ExecutionEvent>>(`/runs/${encodeURIComponent(runId)}/events?after_sequence=${afterSequence}`);
}

export function createMessage(chatId: string, input: {
  content: string;
  client_request_id: string;
  resource_ids?: string[];
  connection_ids?: string[];
}): Promise<MessageDto> {
  return requestJson<MessageDto>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function queueRun(runId: string, input: QueueRunInput, files: File[] = []): Promise<QueueRunResponse> {
  if (files.length) {
    const body = new FormData();
    body.set("content", input.content);
    body.set("model_id", input.model_id);
    body.set("client_request_id", input.client_request_id);
    if (input.effort) body.set("effort", input.effort);
    input.resource_ids?.forEach((id) => body.append("resource_ids", id));
    input.connection_ids?.forEach((id) => body.append("connection_ids", id));
    files.forEach((file) => body.append("files", file));
    const response = await fetch(`${API_ROOT}/runs/${encodeURIComponent(runId)}/queue/with-files`, {
      method: "POST", headers: requestHeaders(), body,
    });
    if (!response.ok) throw await apiError(response);
    return response.json();
  }
  return requestJson<QueueRunResponse>(`/runs/${encodeURIComponent(runId)}/queue`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function editQueuedRun(
  runId: string,
  content: string,
  removedResourceIds: string[],
  files: { id: string; file: File }[],
): Promise<MessageDto> {
  const path = `/runs/${encodeURIComponent(runId)}/queue`;
  if (files.length) {
    const body = new FormData();
    body.set("content", content);
    removedResourceIds.forEach((id) => body.append("remove_resource_ids", id));
    files.forEach(({ id, file }) => {
      body.append("client_upload_ids", id);
      body.append("files", file);
    });
    const response = await fetch(`${API_ROOT}${path}/with-files`, {
      method: "PATCH", headers: requestHeaders(), body,
    });
    if (!response.ok) throw await apiError(response);
    return response.json();
  }
  return requestJson<MessageDto>(path, {
    method: "PATCH", body: JSON.stringify({ content, remove_resource_ids: removedResourceIds }),
  });
}

export async function reorderChatQueue(chatId: string, runIds: string[]): Promise<void> {
  const response = await fetch(`${API_ROOT}/chats/${encodeURIComponent(chatId)}/queue/order`, {
    method: "PATCH",
    headers: requestHeaders(true),
    body: JSON.stringify({ run_ids: runIds }),
  });
  if (!response.ok) throw await apiError(response);
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

export async function streamQuickAssistantMessage(
  input: {
    context_type: "chat" | "workspace";
    context_id: string;
    content: string;
    model_id: string;
    effort?: string;
    client_request_id: string;
    context_until_message_id?: string;
  },
  onEvent: (event: ExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_ROOT}/quick-assistant/messages/stream`, {
    method: "POST",
    headers: requestHeaders(true),
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  if (!response.body) throw new ApiError("The Quick Assistant stream had no body.", 502, "empty_stream");
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
