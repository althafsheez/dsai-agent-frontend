import type {
  ApiList,
  ConnectorStatusDto,
  DriveFilesPage,
  DashboardAiDataset,
  DashboardAiResult,
  DashboardCustomResult,
  DatasetRelations,
  DashboardAiWidget,
  DriveImportResult,
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
  return requestJson(`/connectors/postgresql${params.size ? `?${params}` : ""}`);
}

const connectionPath = (id: string) => `/connectors/postgresql/${encodeURIComponent(id)}`;

export function testPostgresConnection(input: PostgresConnectionInput, id?: string): Promise<{ schemas: PostgresSchemaList }> {
  return requestJson(id ? `${connectionPath(id)}/test` : "/connectors/postgresql/test", {
    method: "POST", body: JSON.stringify(input),
  });
}

export function savePostgresConnection(input: PostgresConnectionInput, id?: string): Promise<PostgresConnection> {
  return requestJson(id ? connectionPath(id) : "/connectors/postgresql", {
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

/** Copies a PostgreSQL table into the Library as a CSV dataset (read-only; dashboards then use it like any file). */
export function importPostgresTable(id: string, schema: string, table: string): Promise<{ resource: { id: string; name?: string }; rows: number }> {
  return requestJson(`${connectionPath(id)}/import`, { method: "POST", body: JSON.stringify({ schema_name: schema, table }) });
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

export function branchChat(chatId: string, messageId: string): Promise<ChatDto> {
  return requestJson<ChatDto>(`/chats/${encodeURIComponent(chatId)}/branch`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId, client_request_id: crypto.randomUUID() }),
  });
}

/** Rewrites a question and deletes every later turn; the caller then re-runs the question. */
export function editChatMessage(chatId: string, messageId: string, content: string): Promise<MessageDto> {
  return requestJson<MessageDto>(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
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
  scopeType: "chat" | "workspace" | "library";
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

/** Zips the saved Library datasets; pass a workspace to download only that folder. */
export function downloadLibraryDatasets(workspace?: { id: string; name: string }): Promise<void> {
  const query = workspace ? `?workspace_id=${encodeURIComponent(workspace.id)}` : "";
  return downloadResource(`/library/datasets/download${query}`, `${workspace?.name ?? "library"}-datasets.zip`);
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
  /** Added straight to the Library (local upload or Drive), not from any chat or workspace. */
  uploaded_in_library?: boolean;
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

export function getQuickAssistantMessages(contextType: "chat" | "workspace", contextId: string, threadId?: string): Promise<ApiList<QuickMessageDto>> {
  const thread = threadId ? `&thread_id=${encodeURIComponent(threadId)}` : "";
  return requestJson<ApiList<QuickMessageDto>>(`/quick-assistant/messages?context_type=${contextType}&context_id=${encodeURIComponent(contextId)}${thread}`);
}

export async function deleteQuickAssistantThread(contextType: "chat" | "workspace", contextId: string, threadId: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/quick-assistant/threads?context_type=${contextType}&context_id=${encodeURIComponent(contextId)}&thread_id=${encodeURIComponent(threadId)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
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
    thread_id?: string;
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

export function getConnectors(): Promise<{ items: ConnectorStatusDto[] }> {
  return requestJson("/connectors/google-drive/status");
}

/** Returns the Google consent URL; the caller navigates the browser there. */
export async function startGoogleDriveAuth(): Promise<string> {
  const { authorization_url } = await requestJson<{ authorization_url: string }>("/connectors/google-drive/authorize", { method: "POST" });
  return authorization_url;
}

export async function disconnectGoogleDrive(): Promise<void> {
  const response = await fetch(`${API_ROOT}/connectors/google-drive`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}

export function listDriveFiles(input: { folderId?: string | null; query?: string; pageToken?: string | null }): Promise<DriveFilesPage> {
  const params = new URLSearchParams();
  if (input.folderId) params.set("folder_id", input.folderId);
  if (input.query) params.set("q", input.query);
  if (input.pageToken) params.set("page_token", input.pageToken);
  return requestJson(`/connectors/google-drive/files${params.size ? `?${params}` : ""}`);
}

export function importDriveFiles(input: { fileIds: string[]; scopeType: "chat" | "workspace" | "library"; scopeId: string; messageId?: string }): Promise<DriveImportResult> {
  return requestJson("/connectors/google-drive/import", {
    method: "POST",
    body: JSON.stringify({ file_ids: input.fileIds, scope_type: input.scopeType, scope_id: input.scopeId, message_id: input.messageId }),
  });
}

export function generateDashboardWithAi(input: { prompt: string; datasets: DashboardAiDataset[]; modelId: string; context?: string }): Promise<DashboardAiResult> {
  return requestJson("/dashboards/ai/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: input.prompt, datasets: input.datasets, model_id: input.modelId, context: input.context ?? "" }),
  });
}

export function tuneDashboardWithAi(input: { instruction: string; widgets: DashboardAiWidget[]; slicers: string[]; name: string; datasets: DashboardAiDataset[]; modelId: string; context?: string }): Promise<DashboardAiResult> {
  return requestJson("/dashboards/ai/tune", {
    method: "POST",
    body: JSON.stringify({ instruction: input.instruction, widgets: input.widgets, slicers: input.slicers, name: input.name, datasets: input.datasets, model_id: input.modelId, context: input.context ?? "" }),
  });
}

/** A chart no preset covers: the AI writes a Python script, the server runs it, and the working tile comes back. */
export function buildCustomChartWithAi(input: { request: string; title?: string; datasetIds: string[]; modelId: string }): Promise<{ widget: DashboardAiWidget; result: DashboardCustomResult }> {
  return requestJson("/dashboards/ai/custom", {
    method: "POST",
    body: JSON.stringify({ request: input.request, title: input.title ?? "", dataset_ids: input.datasetIds, model_id: input.modelId }),
  });
}

/** Runs a saved tile script on the current rows. */
export async function runCustomChart(script: string, datasetIds: string[]): Promise<DashboardCustomResult> {
  const body = await requestJson<{ result: DashboardCustomResult }>("/dashboards/custom/run", { method: "POST", body: JSON.stringify({ script, dataset_ids: datasetIds }) });
  return body.result;
}

export interface SqlTable { dataset_id: string; dataset: string; table: string; columns: string[] }
export interface SqlResult { columns: string[]; rows: Array<Array<string | number | null>>; truncated: boolean; tables: SqlTable[] }

/** Runs one read-only SELECT over the chosen datasets (each dataset is a table named after its file). */
export function runDashboardSql(sql: string, datasetIds: string[]): Promise<SqlResult> {
  return requestJson("/dashboards/sql/run", { method: "POST", body: JSON.stringify({ sql, dataset_ids: datasetIds }) });
}

/** The table and column names a query can use for these datasets. */
export async function getSqlTables(datasetIds: string[]): Promise<SqlTable[]> {
  const body = await requestJson<{ tables: SqlTable[] }>("/dashboards/sql/tables", { method: "POST", body: JSON.stringify({ sql: "", dataset_ids: datasetIds }) });
  return body.tables;
}

/** Where two or more datasets overlap, and where they disagree about the same quantity. */
export function analyzeDatasets(datasetIds: string[]): Promise<DatasetRelations> {
  return requestJson("/dashboards/ai/analyze", { method: "POST", body: JSON.stringify({ dataset_ids: datasetIds }) });
}

export function reviewDashboardWithAi(input: { widgets: DashboardAiWidget[]; datasets: DashboardAiDataset[]; modelId: string }): Promise<DashboardAiResult> {
  return requestJson("/dashboards/ai/review", {
    method: "POST",
    body: JSON.stringify({ widgets: input.widgets, datasets: input.datasets, model_id: input.modelId }),
  });
}

export interface DatasetRowsDto {
  name: string;
  columns: Array<{ name: string; data_type: string }>;
  rows: Array<Array<string | number | boolean | null>>;
  total_rows: number;
  truncated: boolean;
  /** When the data was last replaced (upload time, or the last Google Drive re-sync). */
  refreshed_at?: string;
  /** Changes whenever the data changes. */
  version?: string;
  /** True when the signed-in user can re-sync this dataset from Google Drive. */
  syncable?: boolean;
}

/** Up to 6,000 rows of a CSV or XLSX dataset, for dashboards. */
export function getDatasetRows(resourceId: string, limit = 6000): Promise<DatasetRowsDto> {
  return requestJson(`/datasets/${encodeURIComponent(resourceId)}/rows?limit=${limit}`);
}

/** One widget of the listing card, in the dashboard's own order, type and width. */
export interface PreviewTileDto {
  type: string; title: string; span: 1 | 2 | 3;
  value?: string; max?: string; ratio?: number;
  labels?: string[]; series?: number[]; points?: Array<[number, number]>;
  columns?: string[]; rows?: string[][];
}
export interface DashboardPreviewDto { tiles: PreviewTileDto[]; total: number; delta?: { text: string; positive: boolean; label: string } | null }
export interface DashboardShareDto { user_id: string; role: "viewer" | "editor"; name?: string }
export interface DashboardRecordDto {
  id: string; name: string; description: string; status: "draft" | "published"; pinned: boolean;
  slicers: string[]; dataset_ids: string[]; widgets: unknown[]; owner: string; ownership: "owned" | "shared"; created_at: string; updated_at: string;
  role: "owner" | "editor" | "viewer"; refresh_minutes: number;
  /** The first KPI and a small version of the first chart, computed by the backend when the dashboard is saved. */
  preview?: DashboardPreviewDto;
  /** Google Drive files feeding this dashboard; the server re-downloads them when the dashboard has automatic refresh on. */
  sources?: Array<{ name: string; provider: "google-drive"; refreshed_at: string | null; error: string | null }>;
  /** Only sent to the owner. */
  shares?: DashboardShareDto[];
  /** DAX measures (Power BI style) that tiles can show. */
  measures?: DaxMeasureDto[];
}
export type DashboardSaveBody = Pick<DashboardRecordDto, "name" | "description" | "status" | "slicers" | "dataset_ids" | "widgets"> & { pinned?: boolean; id?: string; refresh_minutes?: number; shares?: DashboardShareDto[]; measures?: DaxMeasureDto[] };

export type DateGrain = "year" | "quarter" | "month" | "day";
export interface DaxMeasureDto { name: string; expression: string; format?: "number" | "percent" | "currency" }
export interface DaxRunInput {
  expression: string; datasetIds: string[]; measures: DaxMeasureDto[];
  /** Evaluate once per value of this column; leave out for a single number. */
  group?: { datasetId: string; column: string; grain?: DateGrain }; filters?: Record<string, string[]>; order?: "value" | "name";
}
/** Evaluates a DAX expression with the dashboard's measures, in the current filter context (slicers, optional group-by column). */
export function runDax(input: DaxRunInput): Promise<SqlResult & { sql: string }> {
  return requestJson("/dashboards/dax/run", {
    method: "POST",
    body: JSON.stringify({
      expression: input.expression, dataset_ids: input.datasetIds, measures: input.measures, filters: input.filters ?? {}, order: input.order ?? "value",
      group_dataset_id: input.group?.datasetId ?? null, group_column: input.group?.column ?? null, group_grain: input.group?.grain ?? null,
    }),
  });
}

export interface DashboardPersonDto { id: string; name: string; initials: string }
export async function listDashboardPeople(): Promise<DashboardPersonDto[]> {
  return (await requestJson<{ items: DashboardPersonDto[] }>("/dashboards/people")).items;
}
/** Re-downloads a Google Drive dataset; resolves with "unchanged" when the file did not change. */
export function syncDatasetFromDrive(resourceId: string): Promise<{ status: "updated" | "unchanged"; refreshed_at: string }> {
  return requestJson(`/datasets/${encodeURIComponent(resourceId)}/sync`, { method: "POST" });
}

export async function listDashboardRecords(): Promise<DashboardRecordDto[]> {
  return (await requestJson<{ items: DashboardRecordDto[] }>("/dashboards")).items;
}
export function getDashboardRecord(id: string): Promise<DashboardRecordDto> {
  return requestJson(`/dashboards/${encodeURIComponent(id)}`);
}
export function saveDashboardRecord(body: DashboardSaveBody): Promise<DashboardRecordDto> {
  return requestJson("/dashboards", { method: "PUT", body: JSON.stringify(body) });
}
export function pinDashboardRecord(id: string, pinned: boolean): Promise<DashboardRecordDto> {
  return requestJson(`/dashboards/${encodeURIComponent(id)}/pin`, { method: "PUT", body: JSON.stringify({ pinned }) });
}
export async function deleteDashboardRecord(id: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/dashboards/${encodeURIComponent(id)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}

export type WorkflowStepKind = "data" | "script" | "ai" | "condition" | "notify" | "human";
export interface WorkflowAction {
  provider: "postgresql";
  connection_id: string;
  instructions: string;
  operation: "query";
  arguments: { sql: string; bindings: Array<string | number | boolean | null>; limit: number };
  output: "table";
  summary: string;
  validation: "valid";
  test_status: "untested" | "passed";
  test_receipt?: string | null;
}
export interface WorkflowQueryTable {
  kind: "query_table";
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  duration_ms: number;
  truncated: boolean;
  output_id?: string;
}
export interface WorkflowActionRequest {
  provider: "postgresql";
  connection_id: string;
  instructions: string;
  previous_sql?: string;
  feedback?: string;
}
export interface WorkflowActionProposal {
  status: "supported" | "unsupported" | "needs_clarification" | "missing_requirement";
  message: string;
  action: WorkflowAction | null;
}
export type WorkflowActionTest = { status: "passed"; result: WorkflowQueryTable; receipt: string; duration_ms: number; logs: string[] }
  | { status: "failed"; error: string; code: string; duration_ms: number; logs: string[] };

export function generateWorkflowAction(body: WorkflowActionRequest): Promise<WorkflowActionProposal> {
  return requestJson("/workflow-store/actions/generate", { method: "POST", body: JSON.stringify(body) });
}
export function testWorkflowAction(action: WorkflowAction): Promise<WorkflowActionTest> {
  return requestJson("/workflow-store/actions/test", { method: "POST", body: JSON.stringify(action) });
}
export function applyWorkflowAction(action: WorkflowAction, receipt?: string): Promise<WorkflowAction> {
  return requestJson("/workflow-store/actions/apply", { method: "POST", body: JSON.stringify({ action, test_receipt: receipt }) });
}
export interface WorkflowStepDto { id: string; kind: WorkflowStepKind | string; title: string; detail: string; config?: Record<string, unknown> }
export interface WorkflowTriggerDto { kind: "manual" | "schedule"; config?: { frequency?: string; time?: string; day?: string; day_of_month?: string | number; show_on_canvas?: false } }
export interface WorkflowRecordDto {
  id: string; name: string; description: string; prompt: string; state: "active" | "inactive" | "draft";
  trigger: WorkflowTriggerDto; steps: WorkflowStepDto[]; schedule: string;
  next_run_at: string | null; last_run_at: string | null; created_at: string; updated_at: string;
}
export type WorkflowSaveBody = Pick<WorkflowRecordDto, "name" | "description" | "prompt" | "state" | "trigger" | "steps"> & { id?: string };
export type WorkflowStepStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";
export interface WorkflowStepResultDto {
  step_id: string; title: string; kind: string; status: WorkflowStepStatus; input: unknown; output: unknown;
  logs: string[]; error: string; started_at: string | null; finished_at: string | null;
  progress?: string;
}
export interface WorkflowRunRecordDto {
  id: string; workflow_id: string; workflow_name: string; trigger: "manual" | "schedule" | "test";
  status: "running" | "success" | "failed" | "cancelled"; results: WorkflowStepResultDto[]; error: string;
  started_at: string; finished_at: string | null; cancelled_at: string | null;
}

export async function listWorkflowRecords(): Promise<WorkflowRecordDto[]> {
  return (await requestJson<{ items: WorkflowRecordDto[] }>("/workflow-store")).items;
}
export function getWorkflowRecord(id: string): Promise<WorkflowRecordDto> {
  return requestJson(`/workflow-store/${encodeURIComponent(id)}`);
}
export function saveWorkflowRecord(body: WorkflowSaveBody): Promise<WorkflowRecordDto> {
  return requestJson("/workflow-store", { method: "PUT", body: JSON.stringify(body) });
}
export function setWorkflowRecordState(id: string, state: WorkflowRecordDto["state"]): Promise<WorkflowRecordDto> {
  return requestJson(`/workflow-store/${encodeURIComponent(id)}/state`, { method: "PUT", body: JSON.stringify({ state }) });
}
export async function deleteWorkflowRecord(id: string): Promise<void> {
  const response = await fetch(`${API_ROOT}/workflow-store/${encodeURIComponent(id)}`, { method: "DELETE", headers: requestHeaders() });
  if (!response.ok) throw await apiError(response);
}
export async function listWorkflowRunRecords(workflowId?: string): Promise<WorkflowRunRecordDto[]> {
  const query = workflowId ? `?workflow_id=${encodeURIComponent(workflowId)}` : "";
  return (await requestJson<{ items: WorkflowRunRecordDto[] }>(`/workflow-store/runs${query}`)).items;
}
export function getWorkflowRunRecord(id: string): Promise<WorkflowRunRecordDto> {
  return requestJson(`/workflow-store/runs/${encodeURIComponent(id)}`);
}
export function runWorkflowNow(id: string): Promise<WorkflowRunRecordDto> {
  return requestJson(`/workflow-store/${encodeURIComponent(id)}/run`, { method: "POST" });
}
export function testWorkflow(id: string, steps: WorkflowStepDto[]): Promise<WorkflowRunRecordDto> {
  return requestJson(`/workflow-store/${encodeURIComponent(id)}/test`, { method: "POST", body: JSON.stringify({ steps }) });
}
export function cancelWorkflowRunRecord(id: string): Promise<WorkflowRunRecordDto> {
  return requestJson(`/workflow-store/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
export interface WorkflowAiBody { prompt?: string; datasetIds: string[]; steps?: WorkflowStepDto[]; modelId: string }
const aiBody = (body: WorkflowAiBody) => JSON.stringify({ prompt: body.prompt ?? "", dataset_ids: body.datasetIds, steps: body.steps ?? [], model_id: body.modelId });
export async function rephraseWorkflowPrompt(body: WorkflowAiBody): Promise<string> {
  return (await requestJson<{ prompt: string }>("/workflow-store/ai/rephrase", { method: "POST", body: aiBody(body) })).prompt;
}
export function planWorkflowWithAi(body: WorkflowAiBody): Promise<{ name: string; description: string; prompt: string; steps: WorkflowStepDto[] }> {
  return requestJson("/workflow-store/ai/plan", { method: "POST", body: aiBody(body) });
}
export function buildWorkflowScripts(body: WorkflowAiBody): Promise<{ steps: WorkflowStepDto[]; notes: string[] }> {
  return requestJson("/workflow-store/ai/build", { method: "POST", body: aiBody(body) });
}
