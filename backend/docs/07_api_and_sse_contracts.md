# 07. API & SSE Contracts

The backend exposes a REST API for session management and file uploads, and a Server-Sent Events (SSE) streaming endpoint for real-time model token and tool execution delivery.

---

## REST Endpoints Reference

### 1. Health & Discovery

#### `GET /health`
Returns runtime status, model configuration, and Langfuse connection state.
- **Response**:
  ```json
  {
    "status": "healthy",
    "engine": "duckdb-in-process",
    "gemini_configured": true,
    "gemini_model": "gemini-3.1-flash-lite",
    "langfuse_configured": true,
    "timestamp": "2026-11-22T08:20:00+00:00"
  }
  ```

#### `GET /api/models`
Returns the model allowlist and supported effort levels.
- **Response**:
  ```json
  {
    "default_model_id": "gemini-3.1-flash-lite",
    "models": [
      {
        "id": "gemini-3.1-flash-lite",
        "name": "Gemini 3.1 Flash Lite",
        "description": "Ultra-low latency model (<5s response)",
        "supported_efforts": ["low", "medium", "high"],
        "default_effort": "medium"
      }
    ]
  }
  ```

---

### 2. Chat Lifecycle

#### `POST /api/chats`
First Send creates the chat. Uploaded files remain in browser memory until chat creation.
- **Request**:
  ```json
  {
    "title": "Quarterly Sales Analysis",
    "workspace_id": null,
    "content": "What is the average transaction value?",
    "model_id": "gemini-3.1-flash-lite",
    "effort": "medium"
  }
  ```
- **Response**:
  ```json
  {
    "chat": { "id": "chat-4441a4a6...", "title": "Quarterly Sales Analysis", "workspace_id": null },
    "message": { "id": "msg-12c8f...", "role": "user", "content": "What is the average...", "status": "completed" }
  }
  ```

#### `GET /api/chats/{chat_id}/messages`
Retrieves chronologically sorted messages for a chat.

#### `POST /api/chats/{chat_id}/messages`
Appends a follow-up user message to an existing chat.

#### `POST /api/chats/{chat_id}/runs/{run_id}/cancel`
Signals the server to stop active generation and mark the run as `interrupted`.

---

### 3. File Resources

#### `POST /api/resources/upload`
Uploads a file and scopes it to a chat or workspace. Tabular files (`.csv`, `.parquet`, `.xlsx`) are automatically cataloged as `dataset`; other files are cataloged as `artifact`.
- **Form Data**:
  - `file`: File binary.
  - `scope_type`: `"chat"` | `"workspace"`
  - `scope_id`: UUID of chat or workspace.
  - `client_upload_id`: Client-generated idempotency key.

#### `GET /api/datasets?chat_id={id}`
Returns all datasets scoped to the chat or workspace.

#### `GET /api/artifacts?chat_id={id}`
Returns all artifacts scoped to the chat or workspace.

---

## Server-Sent Events (SSE) Protocol

### Stream Initiation
- **Endpoint**: `POST /api/chats/{chat_id}/messages/stream`
- **Request Header**: `Accept: text/event-stream`
- **Payload**: `{"user_message_id": "msg-..."}`

### Wire Format
Events are emitted as UTF-8 NDJSON lines prefixed with `data: `:
```text
data: {"event_id": "evt-1", "run_id": "run-1", "type": "agent.started", "data": {...}}
data: {"event_id": "evt-2", "run_id": "run-1", "type": "message.created", "data": {...}}
data: {"event_id": "evt-3", "run_id": "run-1", "type": "tool.started", "data": {...}}
data: {"event_id": "evt-4", "run_id": "run-1", "type": "tool.completed", "data": {...}}
data: {"event_id": "evt-5", "run_id": "run-1", "type": "message.delta", "data": {...}}
data: {"event_id": "evt-6", "run_id": "run-1", "type": "run.completed", "data": {...}}
```

### Event Types Specification

| Event Type | Payload Attributes | Description |
| :--- | :--- | :--- |
| `agent.started` | `run_id`, `assistant_message_id`, `status: "running"` | Emitted immediately when the agent accepts the stream. |
| `message.created` | `message_id` | Announces the assistant message ID reserved in the database. |
| `tool.started` | `tool_call_id`, `step_id`, `name`, `arguments` | Emitted when Gemini initiates a tool call. |
| `tool.completed` | `tool_call_id`, `step_id`, `name`, `duration_ms`, `output` | Emitted when local tool execution finishes. |
| `message.delta` | `text` | Streamed token chunk delivered to the chat renderer. |
| `run.completed` | `run.id`, `status: "completed"`, `duration_ms`, `metrics` | Signals successful run termination and carries latency metrics. |
| `run.failed` | `run.id`, `status: "failed"`, `error` | Emitted if an unrecoverable exception occurs. |
