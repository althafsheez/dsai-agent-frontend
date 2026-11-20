import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

DB_PATH = os.path.join(os.path.dirname(__file__), "agentic.db")
_lock = threading.Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                deleted_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                title_source TEXT NOT NULL DEFAULT 'fallback',
                workspace_id TEXT,
                created_by TEXT NOT NULL,
                client_request_id TEXT,
                archived_at TEXT,
                deleted_at TEXT,
                first_run_at TEXT,
                is_unread INTEGER NOT NULL DEFAULT 0,
                active_run_status TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'normal',
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                position INTEGER NOT NULL,
                client_request_id TEXT,
                attachment_refs TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                user_message_id TEXT NOT NULL,
                assistant_message_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                model_id TEXT NOT NULL,
                effort TEXT,
                client_request_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                total_duration_ms INTEGER,
                metrics_json TEXT,
                error_code TEXT,
                error_detail TEXT,
                FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS execution_events (
                event_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS resources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                scope_type TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                row_count INTEGER,
                column_count INTEGER,
                columns_json TEXT,
                preview_rows_json TEXT,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


# =====================================================================
# Workspaces
# =====================================================================

def get_workspaces() -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM workspaces WHERE deleted_at IS NULL ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]


def create_workspace(name: str, description: Optional[str] = None, created_by: str = "user-you") -> Dict[str, Any]:
    now = utc_now()
    ws_id = f"ws-{uuid4()}"
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO workspaces (id, name, description, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (ws_id, name, description, created_by, now, now),
        )
        conn.commit()
    return {
        "id": ws_id,
        "name": name,
        "description": description,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
        "deleted_at": None,
    }


# =====================================================================
# Chats
# =====================================================================

def _row_to_chat(row: sqlite3.Row) -> Dict[str, Any]:
    data = dict(row)
    data["is_unread"] = bool(data.get("is_unread", 0))
    return data


def create_chat(
    title: str,
    workspace_id: Optional[str] = None,
    client_request_id: Optional[str] = None,
    created_by: str = "user-you",
) -> Dict[str, Any]:
    now = utc_now()
    chat_id = f"chat-{uuid4()}"
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO chats (
                id, title, title_source, workspace_id, created_by, client_request_id,
                is_unread, created_at, updated_at
            )
            VALUES (?, ?, 'manual', ?, ?, ?, 0, ?, ?)
            """,
            (chat_id, title[:200], workspace_id, created_by, client_request_id, now, now),
        )
        conn.commit()
        cursor.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
        return _row_to_chat(cursor.fetchone())


def get_chats(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        if workspace_id:
            cursor.execute(
                "SELECT * FROM chats WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
                (workspace_id,),
            )
        else:
            cursor.execute("SELECT * FROM chats WHERE deleted_at IS NULL ORDER BY updated_at DESC")
        return [_row_to_chat(row) for row in cursor.fetchall()]


def get_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
        row = cursor.fetchone()
        return _row_to_chat(row) if row else None


def update_chat(
    chat_id: str,
    title: Optional[str] = None,
    workspace_id: Optional[str] = None,
    is_unread: Optional[bool] = None,
    active_run_status: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    now = utc_now()
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        updates = ["updated_at = ?"]
        params: List[Any] = [now]
        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if workspace_id is not None:
            updates.append("workspace_id = ?")
            params.append(workspace_id)
        if is_unread is not None:
            updates.append("is_unread = ?")
            params.append(1 if is_unread else 0)
        if active_run_status is not None:
            updates.append("active_run_status = ?")
            params.append(active_run_status)
        params.append(chat_id)
        cursor.execute(f"UPDATE chats SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    return get_chat(chat_id)


def delete_chat(chat_id: str) -> None:
    now = utc_now()
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE chats SET deleted_at = ? WHERE id = ?", (now, chat_id))
        conn.commit()


# =====================================================================
# Messages
# =====================================================================

def _row_to_message(row: sqlite3.Row) -> Dict[str, Any]:
    data = dict(row)
    try:
        data["attachment_refs"] = json.loads(data.get("attachment_refs") or "[]")
    except Exception:
        data["attachment_refs"] = []
    return data


def create_message(
    chat_id: str,
    role: str,
    content: str,
    client_request_id: Optional[str] = None,
    status: str = "completed",
    position: Optional[int] = None,
    attachment_refs: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    now = utc_now()
    msg_id = f"msg-{uuid4()}"
    refs_json = json.dumps(attachment_refs or [])
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        if position is None:
            cursor.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_id = ?", (chat_id,))
            position = cursor.fetchone()[0]
        cursor.execute(
            """
            INSERT INTO messages (
                id, chat_id, role, kind, content, status, position,
                client_request_id, attachment_refs, created_at, updated_at
            )
            VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, chat_id, role, content, status, position, client_request_id, refs_json, now, now),
        )
        conn.commit()
        cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        return _row_to_message(cursor.fetchone())


def get_messages(chat_id: str) -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY position ASC", (chat_id,))
        return [_row_to_message(row) for row in cursor.fetchall()]


def get_message(message_id: str) -> Optional[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
        row = cursor.fetchone()
        return _row_to_message(row) if row else None


def update_message(
    message_id: str,
    content: Optional[str] = None,
    status: Optional[str] = None,
    attachment_refs: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    now = utc_now()
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        updates = ["updated_at = ?"]
        params: List[Any] = [now]
        if content is not None:
            updates.append("content = ?")
            params.append(content)
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if attachment_refs is not None:
            updates.append("attachment_refs = ?")
            params.append(json.dumps(attachment_refs))
        params.append(message_id)
        cursor.execute(f"UPDATE messages SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    return get_message(message_id)


# =====================================================================
# Runs & Events
# =====================================================================

def create_run(
    chat_id: str,
    user_message_id: str,
    assistant_message_id: str,
    model_id: str,
    effort: Optional[str] = None,
    client_request_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = utc_now()
    run_id = f"run-{uuid4()}"
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO agent_runs (
                id, chat_id, user_message_id, assistant_message_id, status,
                model_id, effort, client_request_id, created_at, started_at
            )
            VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                chat_id,
                user_message_id,
                assistant_message_id,
                model_id,
                effort,
                client_request_id or str(uuid4()),
                now,
                now,
            ),
        )
        conn.commit()
        cursor.execute("SELECT * FROM agent_runs WHERE id = ?", (run_id,))
        return dict(cursor.fetchone())


def get_runs(chat_id: str) -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agent_runs WHERE chat_id = ? ORDER BY created_at ASC", (chat_id,))
        return [dict(row) for row in cursor.fetchall()]


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agent_runs WHERE id = ?", (run_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_run_status(
    run_id: str,
    status: str,
    total_duration_ms: Optional[int] = None,
    metrics: Optional[Dict[str, Any]] = None,
    error_code: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> None:
    now = utc_now()
    metrics_str = json.dumps(metrics) if metrics else None
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE agent_runs
            SET status = ?, finished_at = ?, total_duration_ms = ?, metrics_json = ?, error_code = ?, error_detail = ?
            WHERE id = ?
            """,
            (status, now, total_duration_ms, metrics_str, error_code, error_detail, run_id),
        )
        conn.commit()


def save_execution_event(
    run_id: str,
    sequence: int,
    event_type: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    now = utc_now()
    event_id = f"evt-{uuid4()}"
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO execution_events (event_id, run_id, sequence, type, data, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (event_id, run_id, sequence, event_type, json.dumps(data), now),
        )
        conn.commit()
    return {
        "event_id": event_id,
        "run_id": run_id,
        "sequence": sequence,
        "type": event_type,
        "data": data,
        "timestamp": now,
    }


def get_run_events(run_id: str, after_sequence: int = 0) -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM execution_events
            WHERE run_id = ? AND sequence > ?
            ORDER BY sequence ASC
            """,
            (run_id, after_sequence),
        )
        result: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            d = dict(row)
            try:
                d["data"] = json.loads(d.get("data") or "{}")
            except Exception:
                d["data"] = {}
            result.append(d)
        return result


# =====================================================================
# Resources (Datasets & Artifacts)
# =====================================================================

def _row_to_resource(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    res_type = d.get("resource_type", "dataset")
    res_id = d["id"]

    columns = None
    if d.get("columns_json"):
        try:
            columns = json.loads(d["columns_json"])
        except Exception:
            columns = None

    preview_rows = None
    if d.get("preview_rows_json"):
        try:
            preview_rows = json.loads(d["preview_rows_json"])
        except Exception:
            preview_rows = None

    base = {
        "id": res_id,
        "name": d["name"],
        "resource_type": res_type,
        "mime_type": d["mime_type"],
        "size_bytes": d["size_bytes"],
        "origin": "uploaded",
        "preview_url": f"/api/resources/{res_id}/preview",
        "download_url": f"/api/resources/{res_id}/download",
        "created_by": d["created_by"],
        "created_at": d["created_at"],
        "scope_type": d["scope_type"],
        "run_id": None,
        "file_path": d["file_path"],
    }

    if res_type == "dataset":
        base.update({
            "row_count": d.get("row_count") or 0,
            "column_count": d.get("column_count") or 0,
            "columns": columns or [],
            "preview_rows": preview_rows or [],
        })
    else:
        ext = os.path.splitext(d["name"])[1].lower()
        kind = "image" if ext in [".png", ".jpg", ".jpeg", ".svg"] else (
            "pdf" if ext == ".pdf" else (
                "code" if ext in [".py", ".sql", ".js", ".ts"] else "file"
            )
        )
        base.update({
            "kind": kind,
        })
    return base


def create_resource(
    name: str,
    resource_type: str,
    scope_type: str,
    scope_id: str,
    file_path: str,
    size_bytes: int,
    mime_type: str,
    row_count: Optional[int] = None,
    column_count: Optional[int] = None,
    columns: Optional[List[Dict[str, str]]] = None,
    preview_rows: Optional[List[List[Any]]] = None,
    created_by: str = "user-you",
) -> Dict[str, Any]:
    now = utc_now()
    res_id = f"res-{uuid4()}"
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO resources (
                id, name, resource_type, scope_type, scope_id, file_path,
                mime_type, size_bytes, row_count, column_count, columns_json,
                preview_rows_json, created_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                res_id,
                name,
                resource_type,
                scope_type,
                scope_id,
                file_path,
                mime_type,
                size_bytes,
                row_count,
                column_count,
                json.dumps(columns) if columns else None,
                json.dumps(preview_rows) if preview_rows else None,
                created_by,
                now,
            ),
        )
        conn.commit()
        cursor.execute("SELECT * FROM resources WHERE id = ?", (res_id,))
        return _row_to_resource(cursor.fetchone())


def get_resources(
    scope_id: Optional[str] = None,
    resource_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM resources WHERE 1=1"
        params: List[Any] = []
        if scope_id:
            query += " AND scope_id = ?"
            params.append(scope_id)
        if resource_type:
            query += " AND resource_type = ?"
            params.append(resource_type)
        query += " ORDER BY created_at DESC"
        cursor.execute(query, params)
        return [_row_to_resource(row) for row in cursor.fetchall()]


def get_resource(resource_id: str) -> Optional[Dict[str, Any]]:
    with _lock, get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
        row = cursor.fetchone()
        return _row_to_resource(row) if row else None


# Initialize on import
init_db()
