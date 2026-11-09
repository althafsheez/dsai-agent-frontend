# DSAI API contract — final decision baseline
2026-11-09. This contract defines implementation, not already available endpoints. HTTP JSON uses snake_case, stable opaque IDs, UTC ISO timestamps. DTOs and fetch/SSE adapters live in src/lib/api. Backend serves /api, with an explicitly configured public base URL or same-origin proxy; secrets never use NEXT_PUBLIC variables.

## Implemented backend foundation (2026-11-09)
The first backend slice implements demo users, workspace/chat/message persistence, model discovery/validation, text-only Gemini runs, incremental execution events, cancellation checkpoints, retry, local byte storage, and Alembic initialization. The canonical execution endpoint is `POST /api/chats/{id}/messages/stream`. `POST /api/chats/{id}/runs` is a temporary compatibility path for the initial backend brief; it accepts the same `RunStart` body and emits the same envelopes. Neither path creates a user message: both require an existing `user_message_id`.

Only events that occur are emitted. This slice emits `agent.started`, `message.created`, `message.delta`, `message.completed`, `agent.completed`, `agent.failed`, `agent.cancelled`, and `agent.interrupted` using the envelope documented below. Tool/resource, Queue/Steer, upload, History, Library, and Quick Assistant endpoints remain planned and are not claimed as implemented.

## Common responses and identity
Lists: {items: T[], next_cursor: string|null}. Default 25, max 100; stable cursor includes sort key and ID. Errors: {error:{code,message,request_id,details?}}; details are sanitized.
Demo GET /api/demo/users -> {items:[{id,name,initials}]}. Frontend useAuth selects a stable ID, sends X-Demo-User-Id; backend validates against predefined users. Seed demo-owned and explicitly accessible shared records to exercise All. This header is demo identity, not secure authentication. Central access checks apply to every resource/run, including user switching.

## Records
- User: id, name, initials.
- Workspace: id,name,description,created_by,created_at,updated_at,archived_at:null|timestamp,deleted_at:null|timestamp.
- Chat: id,title,title_source:fallback|generated|manual,workspace_id:null|string,created_by,created_at,updated_at,archived_at,deleted_at,first_run_at:null|timestamp.
- Message: id,chat_id,role:user|assistant,kind:normal|steering,content,status:pending_upload|queued|running|completed|failed|interrupted|cancelled,created_at,updated_at,attachment_refs:ResourceRef[].
- ResourceRef: {resource_type:dataset|artifact,resource_id:string}. ResourceSummary adds name,mime_type,size_bytes,origin:uploaded|generated,preview_url,download_url.
- Dataset: ResourceSummary + created_by,created_at,row_count:null|number,column_count:null|number,columns?:{name,data_type}[],run_id:null|string.
- Artifact: ResourceSummary + kind:image|chart|pdf|report|document|code|file,created_by,created_at,run_id:null|string,saved:boolean,chart_spec?:validated structured specification.
- ResourceLink: id,resource_type,resource_id,scope_type:chat|workspace,scope_id. Unique scope/resource tuple.
- FileObject (internal): id,content_hash,relative_storage_path,mime_type,size_bytes. Resource metadata points to this record; no paths in browser DTOs. User-authorized reuse must not disclose another user's existence/files.
- Favorite: user_id,artifact_id,created_at (unique pair); no copied bytes.
- AgentRun: id,chat_id,user_message_id,assistant_message_id,status:queued|running|completed|failed|cancelled|interrupted,model_id,effort:null|string,client_request_id,previous_run_id:null|string,started_at,finished_at,error_code:null|string,error_detail:null|string.
- ExecutionEvent: event_id,run_id,sequence,type,data,timestamp; increasing sequence per run, persisted public data. Persist safe diagnostic failure details, never secrets.
- SteeringInstruction: id,run_id,message_id,status:received|applied|unapplied,checkpoint:null|string,created_at.
- QuickMessage: id,context_type:chat|workspace,context_id,role,content,status,created_at. Separate from main messages/runs.

## Workspace, chat and History
- GET/POST /api/workspaces. Create {name,description?}; returns Workspace.
- GET /api/workspaces/{id}; GET /api/workspaces/{id}/chats paginated.
- PATCH /api/workspaces/{id} {name?,description?,archived?:boolean}. No archive cascade.
- DELETE /api/workspaces/{id}: set deleted_at only. Preserve children and bytes; exclude deleted workspace context and its children from normal navigation until recovery.
- POST /api/chats {workspace_id?:string|null,content:string,client_request_id:string}: persist chat and first user message once; returns {chat,message}. Called only on first Send, before uploads. Initialize title from first 50 characters. first_run_at remains null.
- GET /api/chats/{id} -> Chat. GET /api/chats/{id}/messages?cursor= -> paginated Messages with resource summaries and associated runs.
- PATCH /api/chats/{id} {title?,workspace_id?,archived?}; title becomes manual; validate membership and retain chat/resource identity.
- DELETE /api/chats/{id}: soft delete, cancel live run/queue, preserve records/bytes.
- GET /api/history?ownership=owned|all&status=active|archived&search=&author_id=&workspace_id=&updated_after=&updated_before=&sort=updated_desc|updated_asc|name_asc&cursor=
  -> paginated {kind:chat|workspace,id,name,workspace_id,workspace_name,author:{id,name},updated_at,archived_at}.
  workspace_id=standalone explicitly filters unassigned chats; omission means all. Exclude soft-deleted resources and unstarted chats (first_run_at=null). Parent archive does not alter child archive filtering. Owned means creator, All means accessible.
- GET /api/navigation/recent?kind=chat|workspace|dashboard|workflow -> bounded summaries sorted by last_accessed_at. Record access on detail open; dashboard/workflow initially empty. Pinned references and activity may use fixture UI in Phase 1, then simple per-user SQLite references and event summaries.

## Upload on Send (no temporary draft uploads)
Keep browser File objects and previews locally. No upload/chat call before Send.
1. POST /api/chats with initial content for a new chat; existing chats use POST /api/chats/{id}/messages with {content,client_request_id} to persist a pending_upload message.
2. POST /api/resources/upload multipart per file: file, scope_type, scope_id, message_id? (chat only), client_upload_id. Validate scope/owner, classification and message association. Returns {resource,link}. Idempotent by user/client_upload_id; retries reuse registration.
3. POST stream with existing user_message_id to start execution after all uploads succeed or explicit removal of failures. Set first_run_at when first run accepted. Incomplete sends never appear as empty History entries.
Successful partial uploads remain attached; retry only failed uploads, keep same chat/message. Refresh loses unsent browser bytes; incomplete records are excluded from normal History and can be resumed by known chat ID with reselection. No automatic retry from an unloaded page.
Workspace uploads use scope_type=workspace, no chat/message creation.
CSV/XLSX/XLS/Parquet structured formats -> Dataset. Images/PDF/documents/charts -> Artifact. Validate explicit extension/MIME allowlist and configured size limits; unsupported file types fail clearly. Generated structured files follow identical classification.

## Resources, preview and Library
- GET /api/datasets?chat_id= -> {workspace_datasets:Dataset[],chat_datasets:Dataset[]} paginated per scope when needed; resolve deduplicated effective IDs for agent. GET /api/datasets?workspace_id= -> workspace Dataset list.
- GET /api/artifacts?chat_id= or workspace_id= -> scoped Artifact list. Workspace visibility requires explicit links, never auto-publish private chat resources.
- POST /api/resource-links {resource_type,resource_id,scope_type,scope_id}; validate access, idempotent unique tuple. No dataset-moving UI.
- GET /api/datasets/{id}/preview?limit=50: {name,total_rows,column_count,columns:[{name,data_type}],rows:scalar[][],truncated:boolean}. Cap at 100 and bound cell size; counts nullable until inspection completes.
- GET /api/datasets/{id}/download; GET /api/artifacts/{id}/download.
- GET /api/artifacts/{id}/preview: controlled image/PDF response or metadata/validated chart spec; unsupported formats offer download. No arbitrary filesystem URLs or executable HTML.
- PATCH /api/artifacts/{id} {saved:boolean}; GET /api/library?cursor= -> current user's accessible saved artifacts; unstar deletes only Favorite.

## Main runs, Queue, Steer, retry and cancellation
- GET /api/models -> {default_model_id:string|null,models:[{id,label,supported_efforts:string[],default_effort:string|null}]} from configured Gemini allowlist and capabilities. Empty list with readable configuration status if unavailable. Validate model/effort before accepting a run.
- POST /api/chats/{id}/messages/stream over fetch with {user_message_id,model_id,effort?:string,client_request_id:string}. Validate message and ready attachments. One running main run per chat. Persist user/run linkage and assistant placeholder before events. Query-scoped configuration; no persisted UI model preferences required.
- POST /api/runs/{id}/queue {content,resource_refs?,model_id,effort?,client_request_id}: persist queued user Message and queued AgentRun with sequence. Returns {message,run,position}. On successful completion, coordinator starts next queued run, emits agent.started with new run_id over same session stream. Queue item model/effort fixed on submission. Failure pauses queue; user must explicitly resume via POST /api/chats/{id}/queue/resume/stream. DELETE /api/runs/{queued_id}/queue cancels a queued entry.
- POST /api/runs/{id}/steer {content,client_request_id}: persist separate steering message and instruction, return {instruction}; append at next safe tool/iteration checkpoint and emit steer.applied. Already-running tools finish or are cancelled explicitly; steering does not restart conversation. If run finishes before application, persist unapplied and explain this in UI.
- POST /api/runs/{id}/cancel {reason:user|navigation|refresh}: idempotently request cancellation and cancel pending automatic queue entries; preserve records. Stream disconnect also triggers best-effort cancellation. Browser abort + keepalive cancel when possible; server disconnect detection is authoritative. Mark navigation/refresh as interrupted, user stop as cancelled. No automatic reconnect/background execution.
- POST /api/runs/{id}/retry/stream {client_request_id,model_id?,effort?}: new run with previous_run_id and SAME user_message_id; new assistant attempt, preserve old partial assistant/events/resources. Reject while another run is active.
- GET /api/chats/{id}/runs; GET /api/runs/{id}/events?after_sequence=&cursor= for history (not live reconnection).
- Store partial assistant content in bounded batches and events progressively. At exit finalize run/message statuses even on disconnect, provider error, timeout or cancellation. At backend startup reconcile stale running runs to interrupted and queued runs to cancelled; no hidden execution on restart.
- Idempotency: unique user/client_request_id per operation. Repeated create/upload/queue returns existing record; repeated stream for running/terminal run returns 409 with run_id, requiring status/history retrieval rather than duplicate execution. Explicit retry uses a new request ID.
- Use a single FastAPI worker for MVP in-process coordinator; per-chat locks prevent races. SQLite backs queued work, instructions and events. No Redis/worker framework.

## SSE protocol
text/event-stream, Cache-Control:no-cache. SSE id is event_id; event is type; data is JSON envelope {event_id,run_id,type,data,timestamp,sequence}. Parse UTF-8 incrementally with multiline frames and chunk boundaries; ignore comment heartbeats. Main stream may contain successive queued runs; use run_id to route events.
Events:
- message.created: {message}
- agent.started: {run}; agent.completed: {run_id}; agent.failed: {run_id,error}; agent.cancelled/agent.interrupted: {run_id,reason}
- progress: {label,detail?}
- reasoning.summary: {text,source:model}; only explicit model-exposed summaries
- tool.started: {tool_call_id,name,arguments}; tool.completed: {tool_call_id,output,duration_ms}; tool.failed: {tool_call_id,error}
- message.delta: {message_id,text}; message.completed: {message_id,content,status}
- dataset.created: {dataset,scope}; artifact.created: {artifact,scope}
- queue.updated: {items}; steer.received/applied/unapplied: {instruction}
- chat.updated: {chat} after title generation, never overwrite manual rename
- error: {code,message,request_id}
Persist serializable public tool arguments/results with secret redaction and size limits; large output referenced as stored file instead. Flush events and partial answer before terminal state. Persist only metadata after client disconnect, never continue analysis in background.

## Quick Assistant
GET /api/quick-assistant/messages?context_type=chat|workspace&context_id=.
POST /api/quick-assistant/messages/stream {context_type,context_id,content,client_request_id}: independent read-only Gemini exchange, separate message table and cancellation scope. Context includes accessible resource metadata, safe previews and existing conversation. No E2B, mutation tools or main-run cancellation. Leaving context cancels its stream.

## Files and E2B
Only backend/storage contains durable bytes, under generated IDs. SQLite metadata includes content hashes; no filename-derived trusted paths. Per-run E2B sandbox, input paths under /home/user/inputs, output discovery strictly /home/user/outputs. Resolve real paths, reject escapes/symlinks and unsupported/oversized files. Sync after each tool call and finalization when available; cancellation preserves files already synced.
Dedup registration by run_id + normalized output path + content hash. Repeated scan unchanged -> same record; changed bytes at same path -> preserved new version. Shared FileObject can back links without byte duplication.
Register structured outputs as Datasets, other supported outputs as Artifacts; emit corresponding event after durable copy/metadata commit. Cleanup partial failed copies, never delete registered files on unstar/archive/soft delete.
GET /api/health reports readiness; keys backend environment only. Configurable origins/limits; public deployment of demo identity is explicitly unsupported.
