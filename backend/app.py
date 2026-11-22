import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from backend import db
from backend.agent.react_loop import ReActAgent
from backend.config import get_gemini_api_key, get_gemini_model
from backend.engine.duckdb_engine import DuckDBEngine
from backend.engine.python_worker import WarmPythonWorker
from backend.observability import RunTracker, get_recent_traces, get_trace_by_run_id, is_langfuse_configured

app = FastAPI(
    title="DSAI Agentic Engine",
    description="Sub-5s Analytical Engine with Full Trace Observability powering DSAI",
    version="0.3.0",
)

# Enable CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global warm worker and DuckDB instances for persistent session state
global_duckdb = DuckDBEngine()
global_worker = WarmPythonWorker()

# Uploads directory
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# =====================================================================
# Request / Response Schemas
# =====================================================================

class QueryRequest(BaseModel):
    query: str = Field(..., description="The natural language data query to execute")
    dataset_path: Optional[str] = Field(None, description="Local path to dataset file (CSV/Parquet)")


class CreateChatRequest(BaseModel):
    content: str = Field(..., description="Initial user message content")
    workspace_id: Optional[str] = Field(None, description="Optional workspace ID")
    client_request_id: Optional[str] = Field(None, description="Client idempotent request ID")


class UpdateChatRequest(BaseModel):
    title: Optional[str] = None
    workspace_id: Optional[str] = None
    is_unread: Optional[bool] = None


class CreateMessageRequest(BaseModel):
    content: str = Field(..., description="Message text content")
    client_request_id: Optional[str] = Field(None, description="Client idempotent request ID")


class StreamRunRequest(BaseModel):
    user_message_id: Optional[str] = None
    model_id: Optional[str] = None
    effort: Optional[str] = None
    client_request_id: Optional[str] = None


class CreateWorkspaceRequest(BaseModel):
    name: str
    description: Optional[str] = None
    ai_context: Optional[str] = None


class UpdateWorkspaceRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    archived: Optional[bool] = None


class PresenceRequest(BaseModel):
    viewing: bool = True


# =====================================================================
# Metadata & Models
# =====================================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "phase": 0,
        "duckdb": "in-process",
        "python_worker": "warm",
        "turn_budget": 2,
        "gemini_configured": bool(get_gemini_api_key()),
        "gemini_model": get_gemini_model(),
        "observability": "active",
        "langfuse_configured": is_langfuse_configured(),
    }


@app.get("/api/models")
@app.get("/models")
def get_models():
    configured_model = get_gemini_model()
    return {
        "default_model_id": configured_model,
        "models": [
            {
                "id": configured_model,
                "label": f"Gemini ({configured_model})",
                "supported_efforts": ["low", "medium", "high"],
                "default_effort": "low",
            },
            {
                "id": "gemini-3.1-flash-lite",
                "label": "Gemini 3.1 Flash-Lite (Sub-5s Analytical)",
                "supported_efforts": ["low", "medium", "high"],
                "default_effort": "low",
            },
            {
                "id": "gemini-3.5-flash",
                "label": "Gemini 3.5 Flash",
                "supported_efforts": ["low", "medium", "high"],
                "default_effort": "low",
            },
        ],
        "configuration_status": "configured" if get_gemini_api_key() else "missing_key",
    }


# =====================================================================
# Workspaces
# =====================================================================

@app.get("/api/workspaces")
@app.get("/workspaces")
def list_workspaces():
    return {"items": db.get_workspaces(), "next_cursor": None}


@app.post("/api/workspaces")
@app.post("/workspaces")
def create_workspace_endpoint(req: CreateWorkspaceRequest):
    return db.create_workspace(req.name, req.description)


@app.get("/api/workspaces/{workspace_id}")
@app.get("/workspaces/{workspace_id}")
def get_workspace_endpoint(workspace_id: str):
    workspaces = db.get_workspaces()
    for ws in workspaces:
        if ws["id"] == workspace_id:
            return ws
    return {
        "id": workspace_id,
        "name": "Default Workspace",
        "description": None,
        "created_by": "user-you",
        "created_at": db.utc_now(),
        "updated_at": db.utc_now(),
        "archived_at": None,
        "deleted_at": None,
    }


@app.patch("/api/workspaces/{workspace_id}")
@app.patch("/workspaces/{workspace_id}")
def update_workspace_endpoint(workspace_id: str, req: UpdateWorkspaceRequest):
    return {
        "id": workspace_id,
        "name": req.name or "Updated Workspace",
        "description": req.description,
        "created_by": "user-you",
        "created_at": db.utc_now(),
        "updated_at": db.utc_now(),
        "archived_at": None,
        "deleted_at": None,
    }


@app.delete("/api/workspaces/{workspace_id}")
@app.delete("/workspaces/{workspace_id}")
def delete_workspace_endpoint(workspace_id: str):
    return {"ok": True}


@app.get("/api/workspaces/{workspace_id}/chats")
@app.get("/workspaces/{workspace_id}/chats")
def get_workspace_chats(workspace_id: str):
    return {"items": db.get_chats(workspace_id=workspace_id), "next_cursor": None}


@app.get("/api/workspaces/{workspace_id}/context-files")
@app.get("/workspaces/{workspace_id}/context-files")
def get_workspace_context_files(workspace_id: str):
    return {"items": [], "next_cursor": None}


@app.get("/api/workspaces/{workspace_id}/workflows")
@app.get("/workspaces/{workspace_id}/workflows")
def get_workspace_workflows(workspace_id: str):
    return {"items": [], "next_cursor": None}


# =====================================================================
# Chats
# =====================================================================

@app.get("/api/chats")
@app.get("/chats")
def list_chats():
    return {"items": db.get_chats(), "next_cursor": None}


@app.get("/api/chats/activity/list")
@app.get("/chats/activity/list")
def list_chat_activity():
    return {"items": db.get_chats()[:20], "next_cursor": None}


@app.post("/api/chats")
@app.post("/chats")
def create_chat_endpoint(req: CreateChatRequest):
    lines = [line.strip() for line in req.content.split("\n") if line.strip()]
    title = lines[0][:60] if lines else "New Analysis"

    chat = db.create_chat(
        title=title,
        workspace_id=req.workspace_id,
        client_request_id=req.client_request_id,
    )
    message = db.create_message(
        chat_id=chat["id"],
        role="user",
        content=req.content,
        client_request_id=req.client_request_id,
        status="completed",
        position=1,
    )
    return {"chat": chat, "message": message}


@app.get("/api/chats/{chat_id}")
@app.get("/chats/{chat_id}")
def get_chat_endpoint(chat_id: str):
    chat = db.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@app.patch("/api/chats/{chat_id}")
@app.patch("/chats/{chat_id}")
def update_chat_endpoint(chat_id: str, req: UpdateChatRequest):
    chat = db.update_chat(
        chat_id=chat_id,
        title=req.title,
        workspace_id=req.workspace_id,
        is_unread=req.is_unread,
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@app.delete("/api/chats/{chat_id}")
@app.delete("/chats/{chat_id}")
def delete_chat_endpoint(chat_id: str):
    db.delete_chat(chat_id)
    return {"ok": True}


@app.post("/api/chats/{chat_id}/presence")
@app.post("/chats/{chat_id}/presence")
def set_chat_presence_endpoint(chat_id: str, req: PresenceRequest = Body(default=PresenceRequest())):
    return {"ok": True}


# =====================================================================
# Messages
# =====================================================================

@app.get("/api/chats/{chat_id}/messages")
@app.get("/chats/{chat_id}/messages")
def get_messages_endpoint(chat_id: str):
    return {"items": db.get_messages(chat_id), "next_cursor": None}


@app.post("/api/chats/{chat_id}/messages")
@app.post("/chats/{chat_id}/messages")
def create_message_endpoint(chat_id: str, req: CreateMessageRequest):
    return db.create_message(
        chat_id=chat_id,
        role="user",
        content=req.content,
        client_request_id=req.client_request_id,
        status="completed",
    )


# =====================================================================
# Runs & SSE Streaming with Observability
# =====================================================================

@app.get("/api/chats/{chat_id}/runs")
@app.get("/chats/{chat_id}/runs")
def get_chat_runs_endpoint(chat_id: str):
    return {"items": db.get_runs(chat_id), "next_cursor": None}


@app.get("/api/runs/{run_id}/events")
@app.get("/runs/{run_id}/events")
def get_run_events_endpoint(run_id: str, after_sequence: int = 0):
    return {"items": db.get_run_events(run_id, after_sequence), "next_cursor": None}


@app.post("/api/runs/{run_id}/cancel")
@app.post("/runs/{run_id}/cancel")
def cancel_run_endpoint(run_id: str):
    db.update_run_status(run_id, "cancelled")
    return {"run_id": run_id, "status": "cancelled"}


@app.post("/api/chats/{chat_id}/messages/stream")
@app.post("/api/chats/{chat_id}/runs")
@app.post("/chats/{chat_id}/messages/stream")
@app.post("/chats/{chat_id}/runs")
async def stream_chat_run(chat_id: str, req: StreamRunRequest = Body(default=StreamRunRequest())):
    chat = db.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = db.get_messages(chat_id)
    user_msg = None
    if req.user_message_id:
        for m in messages:
            if m["id"] == req.user_message_id:
                user_msg = m
                break

    if not user_msg:
        for m in reversed(messages):
            if m["role"] == "user":
                user_msg = m
                break

    if not user_msg:
        raise HTTPException(status_code=400, detail="No user message found to run")

    # Detect dataset attached to this chat
    chat_resources = db.get_resources(scope_id=chat_id, resource_type="dataset")
    if not chat_resources and chat.get("workspace_id"):
        chat_resources = db.get_resources(scope_id=chat["workspace_id"], resource_type="dataset")

    dataset_path = chat_resources[0]["file_path"] if chat_resources else None

    # Create assistant placeholder message & run record
    assistant_msg = db.create_message(
        chat_id=chat_id,
        role="assistant",
        content="",
        status="running",
    )
    chosen_model = req.model_id or get_gemini_model()
    run = db.create_run(
        chat_id=chat_id,
        user_message_id=user_msg["id"],
        assistant_message_id=assistant_msg["id"],
        model_id=chosen_model,
        effort=req.effort,
        client_request_id=req.client_request_id,
    )
    db.update_chat(chat_id, active_run_status="running")

    # Initialize high-fidelity observability tracker
    tracker = RunTracker(
        run_id=run["id"],
        chat_id=chat_id,
        user_query=user_msg["content"],
        model=chosen_model,
        dataset_path=dataset_path,
    )

    agent = ReActAgent(
        duckdb_engine=global_duckdb,
        python_worker=global_worker,
        model=chosen_model,
    )

    async def event_generator():
        seq = 1
        run_id = run["id"]
        assistant_id = assistant_msg["id"]

        def emit(event_type: str, data: Dict[str, Any]):
            nonlocal seq
            event = db.save_execution_event(run_id, seq, event_type, data)
            seq += 1
            return f"data: {json.dumps(event, default=str)}\n\n"

        # 1. agent.started
        yield emit("agent.started", {
            "run": {
                "id": run_id,
                "assistant_message_id": assistant_id,
                "status": "running",
            }
        })

        # 2. message.created
        yield emit("message.created", {
            "message_id": assistant_id,
        })

        accumulated_text = ""
        tool_counter = 0

        try:
            async for agent_evt in agent.stream_query(
                query=user_msg["content"],
                dataset_path=dataset_path,
                tracker=tracker,
            ):
                evt_type = agent_evt.get("type")

                if evt_type == "tool_call":
                    tool_counter += 1
                    tool_name = agent_evt.get("tool", "tool")
                    args = agent_evt.get("arguments", {})
                    call_id = f"call-{tool_counter}"
                    step_id = f"step-{tool_counter}"
                    tracker.start_tool(tool_name, call_id, step_id, args)

                    yield emit("tool.started", {
                        "tool_call_id": call_id,
                        "step_id": step_id,
                        "name": tool_name,
                        "summary": f"Executing {tool_name.replace('_', ' ')}",
                        "arguments": args,
                        "sql": args.get("sql"),
                        "code": args.get("code"),
                    })

                elif evt_type == "tool_result":
                    tool_name = agent_evt.get("tool", "tool")
                    result = agent_evt.get("result", {})
                    tool_rec = tracker.end_tool(tool_name, output=result)

                    yield emit("tool.completed", {
                        "tool_call_id": tool_rec["call_id"],
                        "step_id": tool_rec["step_id"],
                        "name": tool_name,
                        "duration_ms": tool_rec["duration_ms"],
                        "output": result,
                    })

                elif evt_type == "delta":
                    tracker.record_first_token()
                    text = agent_evt.get("content", "")
                    if text:
                        accumulated_text += text
                        yield emit("message.delta", {
                            "text": text,
                        })

                elif evt_type == "done":
                    final_text = agent_evt.get("content", "") or accumulated_text
                    metrics_res = agent_evt.get("metrics", {})
                    turn_cnt = metrics_res.get("turns", 1)

                    # Finalize observability audit record
                    trace_record = tracker.finish(
                        final_response=final_text,
                        status="completed",
                        turn_count=turn_cnt,
                    )
                    metrics = trace_record["metrics"]
                    total_ms = metrics["total_response_time_ms"]
                    tool_ms = metrics["tool_execution_time_ms"]
                    llm_ms = metrics["llm_time_ms"]

                    # Emit a dedicated execution summary trace step
                    yield emit("tool.completed", {
                        "tool_call_id": f"summary-{run_id}",
                        "step_id": f"step-summary-{run_id}",
                        "name": "total_response_time",
                        "summary": f"Total Response Time: {total_ms}ms (Tools: {tool_ms}ms, LLM: {llm_ms}ms)",
                        "duration_ms": total_ms,
                        "output": metrics,
                    })

                    db.update_message(assistant_id, content=final_text, status="completed")
                    db.update_run_status(
                        run_id,
                        "completed",
                        total_duration_ms=total_ms,
                        metrics=metrics,
                    )
                    db.update_chat(chat_id, active_run_status=None)

                    yield emit("run.completed", {
                        "run": {
                            "id": run_id,
                            "status": "completed",
                            "duration_ms": total_ms,
                            "total_duration_ms": total_ms,
                            "metrics": metrics,
                        }
                    })

                elif evt_type == "error":
                    err_msg = agent_evt.get("content", "Error occurred during execution")
                    trace_record = tracker.finish(
                        final_response=accumulated_text,
                        status="failed",
                        error_detail=err_msg,
                    )
                    total_ms = trace_record["metrics"]["total_response_time_ms"]

                    db.update_message(assistant_id, content=accumulated_text + f"\n\n> [!WARNING]\n> {err_msg}", status="failed")
                    db.update_run_status(run_id, "failed", total_duration_ms=total_ms, error_detail=err_msg)
                    db.update_chat(chat_id, active_run_status=None)

                    yield emit("run.failed", {
                        "run": {
                            "id": run_id,
                            "status": "failed",
                            "error": err_msg,
                            "duration_ms": total_ms,
                        }
                    })

        except Exception as exc:
            trace_record = tracker.finish(
                final_response=accumulated_text,
                status="failed",
                error_detail=str(exc),
            )
            total_ms = trace_record["metrics"]["total_response_time_ms"]

            db.update_message(assistant_id, content=accumulated_text + f"\n\n> [!WARNING]\n> {str(exc)}", status="failed")
            db.update_run_status(run_id, "failed", total_duration_ms=total_ms, error_detail=str(exc))
            db.update_chat(chat_id, active_run_status=None)

            yield emit("run.failed", {
                "run": {
                    "id": run_id,
                    "status": "failed",
                    "error": str(exc),
                    "duration_ms": total_ms,
                }
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =====================================================================
# Observability API Endpoints
# =====================================================================

@app.get("/api/observability/runs")
def list_observability_runs(limit: int = 50):
    """Returns recent execution traces with timing breakdowns (TTFT, tool time, total time)."""
    return {"traces": get_recent_traces(limit=limit)}


@app.get("/api/observability/runs/{run_id}")
def get_observability_run(run_id: str):
    """Returns the full execution trace record for a specific run."""
    trace = get_trace_by_run_id(run_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


# =====================================================================
# Resources (Upload, Preview, Datasets, Artifacts)
# =====================================================================

@app.get("/api/datasets")
@app.get("/datasets")
def list_datasets(chat_id: Optional[str] = None, workspace_id: Optional[str] = None):
    scope_id = chat_id or workspace_id
    items = db.get_resources(scope_id=scope_id, resource_type="dataset") if scope_id else []
    return {"items": items, "next_cursor": None}


@app.get("/api/artifacts")
@app.get("/artifacts")
def list_artifacts(chat_id: Optional[str] = None, workspace_id: Optional[str] = None):
    scope_id = chat_id or workspace_id
    items = db.get_resources(scope_id=scope_id, resource_type="artifact") if scope_id else []
    return {"items": items, "next_cursor": None}


@app.get("/api/library")
@app.get("/library")
def get_library():
    return {"items": [], "next_cursor": None}


@app.post("/api/resources/upload")
@app.post("/resources/upload")
async def upload_resource(
    file: UploadFile = File(...),
    scope_type: str = Form(...),
    scope_id: str = Form(...),
    client_upload_id: str = Form(...),
    message_id: Optional[str] = Form(None),
):
    content = await file.read()
    filename = file.filename or "uploaded_file"
    res_id = f"res-{uuid4()}"
    saved_path = os.path.join(UPLOADS_DIR, f"{res_id}_{filename}")
    with open(saved_path, "wb") as f:
        f.write(content)

    ext = os.path.splitext(filename)[1].lower()
    is_dataset = ext in [".csv", ".parquet", ".tsv"]

    row_count = None
    column_count = None
    columns = None
    preview_rows = None

    if is_dataset:
        resource_type = "dataset"
        try:
            reg = global_duckdb.register_dataset(saved_path, "dataset")
            schema = reg.get("schema", [])
            columns = [{"name": c["column_name"], "data_type": c["column_type"]} for c in schema]
            column_count = len(columns)
            preview = global_duckdb.run_query("SELECT * FROM dataset LIMIT 10")
            rows = preview.get("rows", [])
            preview_rows = [[r.get(c["name"]) for c in columns] for r in rows]
            cnt_res = global_duckdb.run_query("SELECT count(*) as cnt FROM dataset")
            row_count = cnt_res.get("rows", [{}])[0].get("cnt", len(rows))

            # Warm Python worker
            norm_path = saved_path.replace("\\", "/")
            if ext == ".parquet":
                global_worker.execute(f"df = pd.read_parquet(r'{norm_path}')")
            else:
                global_worker.execute(f"df = pd.read_csv(r'{norm_path}')")
        except Exception:
            pass
    else:
        resource_type = "artifact"

    resource = db.create_resource(
        name=filename,
        resource_type=resource_type,
        scope_type=scope_type,
        scope_id=scope_id,
        file_path=saved_path,
        size_bytes=len(content),
        mime_type=file.content_type or "application/octet-stream",
        row_count=row_count,
        column_count=column_count,
        columns=columns,
        preview_rows=preview_rows,
    )

    return {
        "resource": {
            "id": resource["id"],
            "resource_type": resource["resource_type"],
            "name": resource["name"],
        },
        "link_id": f"link-{uuid4()}",
    }


@app.get("/api/resources/{resource_id}/preview")
@app.get("/api/resources/{resource_id}/download")
@app.get("/resources/{resource_id}/preview")
@app.get("/resources/{resource_id}/download")
async def get_resource_file(resource_id: str):
    res = db.get_resource(resource_id)
    if not res or not os.path.exists(res.get("file_path", "")):
        raise HTTPException(status_code=404, detail="Resource not found")
    return FileResponse(
        path=res["file_path"],
        filename=res["name"],
        media_type=res.get("mime_type", "application/octet-stream"),
    )


# =====================================================================
# Quick Assistant
# =====================================================================

@app.get("/api/quick-assistant/messages")
@app.get("/quick-assistant/messages")
def get_quick_assistant_messages():
    return {"items": [], "next_cursor": None}


# =====================================================================
# Phase 0 Direct Benchmark/Smoke Test Endpoint
# =====================================================================

@app.post("/api/query")
async def query_endpoint(req: QueryRequest):
    """
    Executes an analytical query through the 2-turn ReAct loop
    and streams progress, tool execution events, and final response via SSE.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    agent = ReActAgent(
        duckdb_engine=global_duckdb,
        python_worker=global_worker,
    )

    tracker = RunTracker(
        run_id=f"run-{uuid4()}",
        chat_id="direct-query",
        user_query=req.query,
        model=get_gemini_model(),
        dataset_path=req.dataset_path,
    )

    async def event_generator():
        accumulated = ""
        try:
            async for event in agent.stream_query(query=req.query, dataset_path=req.dataset_path, tracker=tracker):
                evt_type = event.get("type")
                if evt_type == "delta":
                    tracker.record_first_token()
                    accumulated += event.get("content", "")
                elif evt_type == "tool_call":
                    tracker.start_tool(event["tool"], "call-1", "step-1", event.get("arguments", {}))
                elif evt_type == "tool_result":
                    tracker.end_tool(event["tool"], output=event.get("result"))
                elif evt_type == "done":
                    tracker.finish(final_response=event.get("content") or accumulated, status="completed")

                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as e:
            tracker.finish(final_response=accumulated, status="failed", error_detail=str(e))
            err_event = {"type": "error", "content": f"Streaming failure: {str(e)}"}
            yield f"data: {json.dumps(err_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
