export interface ApiList<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ModelMetadata {
  id: string;
  label: string;
  supported_efforts: string[];
  default_effort: string | null;
}

export interface ModelsResponse {
  default_model_id: string | null;
  models: ModelMetadata[];
  configuration_status: string;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface ChatDto {
  id: string;
  title: string;
  title_source: "fallback" | "generated" | "manual";
  workspace_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  first_run_at: string | null;
}

export interface MessageDto {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  kind: "normal" | "steering";
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  attachment_refs: Array<{ resource_type: "dataset" | "artifact"; resource_id: string }>;
}

export interface CreateChatResponse {
  chat: ChatDto;
  message: MessageDto;
}

export interface AgentRunDto {
  id: string;
  chat_id: string;
  user_message_id: string;
  assistant_message_id: string;
  status: string;
  model_id: string;
  effort: string | null;
  client_request_id: string;
  previous_run_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_detail: string | null;
}

export interface ExecutionEvent {
  event_id: string;
  run_id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  sequence: number;
}

export interface RunStartInput {
  user_message_id: string;
  model_id: string;
  effort?: string;
  client_request_id: string;
}
