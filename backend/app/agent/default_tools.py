from __future__ import annotations

import json
import hashlib
import logging
import mimetypes
import re
from pathlib import PurePosixPath
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from ..config import Settings
from ..models import AgentMemory, Chat, FileObject, Resource, ResourceLink
from ..storage import LocalFileStorage
from .sandbox import E2BSandboxPool, MAX_OUTPUT_BYTES, OUTPUT_EXTENSIONS, SandboxUnavailable
from .tools import ToolContext, ToolDefinition, ToolRegistry


logger = logging.getLogger(__name__)


def _object_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


def build_tool_registry(
    settings: Settings,
    session_factory: sessionmaker[Session],
    sandbox_pool: E2BSandboxPool,
    storage: LocalFileStorage,
) -> ToolRegistry:
    async def prepare(context: ToolContext) -> dict[str, Any]:
        with session_factory() as session:
            chat = session.get(Chat, context.chat_id)
            scope_filters = [(ResourceLink.scope_type == "chat") & (ResourceLink.scope_id == context.chat_id)]
            if chat and chat.workspace_id:
                scope_filters.append((ResourceLink.scope_type == "workspace") & (ResourceLink.scope_id == chat.workspace_id))
            links = list(session.scalars(select(ResourceLink).where(or_(*scope_filters))))
            staged: list[dict[str, Any]] = []
            seen: set[str] = set()
            for link in links:
                resource = session.get(Resource, link.resource_id)
                if resource is None or resource.created_by != context.user_id or resource.id in seen:
                    continue
                file_object = session.get(FileObject, resource.file_object_id)
                if file_object is None:
                    continue
                content = storage.read_bytes(file_object.relative_storage_path)
                try:
                    path = await sandbox_pool.upload_input(context.run_id, f"{resource.id}-{resource.name}", content)
                except SandboxUnavailable as exc:
                    return {"files": staged, "warning": str(exc)}
                staged.append({"resource_id": resource.id, "name": resource.name, "type": resource.resource_type, "path": path})
                seen.add(resource.id)
            return {"files": staged} if staged else {}

    registry = ToolRegistry(prepare=prepare, cleanup=lambda context: sandbox_pool.close(context.run_id))

    def register_output(path: str, content: bytes, context: ToolContext) -> dict[str, Any]:
        name = PurePosixPath(path).name
        digest = hashlib.sha256(content).hexdigest()
        resource_type = "dataset" if PurePosixPath(name).suffix.lower() in {".csv", ".parquet", ".xlsx", ".xls"} else "artifact"
        with session_factory() as session:
            duplicate = next((item for item in session.scalars(select(Resource).where(Resource.run_id == context.run_id)) if item.metadata_json.get("sandbox_path") == path and item.metadata_json.get("sha256") == digest), None)
            if duplicate is not None:
                resource = duplicate
            else:
                file_object = session.scalar(select(FileObject).where(FileObject.content_hash == digest))
                if file_object is None:
                    stored = storage.store_bytes(content)
                    file_object = FileObject(
                        content_hash=stored.content_hash,
                        relative_storage_path=stored.relative_path,
                        mime_type=mimetypes.guess_type(name)[0] or "application/octet-stream",
                        size_bytes=stored.size_bytes,
                    )
                    session.add(file_object)
                    session.flush()
                resource = Resource(
                    resource_type=resource_type,
                    file_object_id=file_object.id,
                    name=name,
                    origin="generated",
                    created_by=context.user_id,
                    run_id=context.run_id,
                    metadata_json={"sandbox_path": path, "sha256": digest, "size_bytes": len(content)},
                )
                session.add(resource)
                session.flush()
                session.add(ResourceLink(resource_id=resource.id, scope_type="chat", scope_id=context.chat_id))
                session.commit()
                session.refresh(resource)
            summary = {"id": resource.id, "resource_type": resource.resource_type, "name": resource.name, "size_bytes": len(content), "origin": resource.origin}
        sandbox_pool.acknowledge_output(context.run_id, path, digest)
        return summary

    async def persist_generated(result: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        resources: list[dict[str, Any]] = []
        warnings = list(result.get("warnings", []))
        for generated in result.get("generated_files", []):
            path = str(generated.get("path", ""))
            if PurePosixPath(path).suffix.lower() not in OUTPUT_EXTENSIONS:
                continue
            try:
                content = await sandbox_pool.read_output_bytes(context.run_id, path)
                if len(content) > MAX_OUTPUT_BYTES:
                    continue
                resources.append(register_output(path, content, context))
            except Exception:
                logger.exception("Could not persist output for run %s", context.run_id)
                warnings.append(f"Could not save {PurePosixPath(path).name}. Retry a tool call to collect this output again.")
        return {**result, "resources": resources, "warnings": warnings}

    async def web_search(arguments: dict[str, Any], _: ToolContext) -> dict[str, Any]:
        query = str(arguments.get("query", "")).strip()
        count = max(1, min(int(arguments.get("num_results", 5)), 10))
        if not query:
            return {"error": "Search query is required."}
        if not settings.tavily_api_key:
            return {"error": "TAVILY_API_KEY is not configured."}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    json={"api_key": settings.tavily_api_key, "query": query, "max_results": count},
                )
                response.raise_for_status()
            results = response.json().get("results", [])
            return {"results": [
                {"title": str(item.get("title", ""))[:200], "url": str(item.get("url", ""))[:1000], "snippet": str(item.get("content", ""))[:500]}
                for item in results[:count]
            ]}
        except httpx.TimeoutException:
            return {"error": "Web search timed out.", "retryable": True}
        except httpx.HTTPStatusError as exc:
            return {"error": f"Web search returned HTTP {exc.response.status_code}.", "retryable": exc.response.status_code == 429}
        except Exception:
            return {"error": "Web search failed.", "retryable": False}

    async def execute_python(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        result = await sandbox_pool.execute(
            context.run_id,
            str(arguments.get("code", "")),
            int(arguments.get("timeout_seconds", 30)),
        )
        # A script can save useful results and then fail on a later line.
        if result.get("success") or result.get("generated_files"):
            return await persist_generated(result, context)
        return result

    async def list_files(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await sandbox_pool.list_files(context.run_id, str(arguments.get("directory", "/home/user/outputs")))

    async def read_file(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await sandbox_pool.read_text(context.run_id, str(arguments.get("path", "")))

    async def write_file(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        result = await sandbox_pool.write_text(context.run_id, str(arguments.get("path", "")), str(arguments.get("content", "")))
        if result.get("success"):
            result["generated_files"] = [{"path": result["path"]}]
            return await persist_generated(result, context)
        return result

    async def lookup_data(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        try:
            path = sandbox_pool.safe_input_path(str(arguments.get("path", "")))
        except ValueError as exc:
            return {"error": str(exc)}
        sql = str(arguments.get("sql", "")).strip()
        if not re.match(r"(?is)^select\b", sql) or ";" in sql or re.search(r"(?is)\b(insert|update|delete|drop|alter|attach|copy|install|load|pragma|call)\b", sql):
            return {"error": "Only one read-only SELECT query is allowed."}
        quoted_path = path.replace("'", "''")
        extension = path.rsplit(".", 1)[-1].lower()
        if extension not in {"csv", "parquet"}:
            return {"error": "Dataset lookup supports CSV and Parquet files."}
        source = f"read_csv_auto('{quoted_path}')" if extension == "csv" else f"read_parquet('{quoted_path}')"
        code = (
            "import duckdb, json\n"
            f"con=duckdb.connect(':memory:')\ncon.execute(\"CREATE VIEW dataset AS SELECT * FROM {source}\")\n"
            f"rows=con.execute({json.dumps(sql)}).fetchdf().head(200)\n"
            "print(rows.to_json(orient='records', date_format='iso'))\n"
        )
        result = await sandbox_pool.execute(context.run_id, code, 30)
        if not result.get("success"):
            return result
        try:
            return {"rows": json.loads(str(result.get("stdout", "[]"))), "truncated": False}
        except json.JSONDecodeError:
            return {"error": "Dataset query returned an unreadable result."}

    async def save_memory(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        key = str(arguments.get("key", "")).strip()[:100]
        value = str(arguments.get("value", "")).strip()[:4000]
        if not key or not value:
            return {"error": "Memory key and value are required."}
        with session_factory() as session:
            memory = session.scalar(select(AgentMemory).where(AgentMemory.user_id == context.user_id, AgentMemory.key == key))
            if memory is None:
                memory = AgentMemory(user_id=context.user_id, key=key, value=value)
                session.add(memory)
            else:
                memory.value = value
            session.commit()
        return {"success": True, "key": key}

    async def load_memory(_: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        with session_factory() as session:
            memories = session.scalars(select(AgentMemory).where(AgentMemory.user_id == context.user_id).order_by(AgentMemory.updated_at.desc()).limit(50))
            return {"memories": [{"key": memory.key, "value": memory.value} for memory in memories]}

    definitions = [
        ToolDefinition("web_search", "Search the public web for current information.", _object_schema({"query": {"type": "string"}, "num_results": {"type": "integer", "minimum": 1, "maximum": 10}}, ["query"]), web_search),
        ToolDefinition("execute_python", "Execute Python in the run's isolated E2B sandbox. Save generated files only under /home/user/outputs/.", _object_schema({"code": {"type": "string"}, "timeout_seconds": {"type": "integer", "minimum": 1, "maximum": 60}}, ["code"]), execute_python),
        ToolDefinition("list_files", "List non-hidden files in an allowed E2B sandbox directory.", _object_schema({"directory": {"type": "string"}}, []), list_files),
        ToolDefinition("read_file", "Read a bounded UTF-8 text file from the E2B sandbox.", _object_schema({"path": {"type": "string"}}, ["path"]), read_file),
        ToolDefinition("write_file", "Write a bounded text file under /home/user/outputs/ in the E2B sandbox.", _object_schema({"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]), write_file),
        ToolDefinition("lookup_data", "Run one read-only SELECT query against a CSV or Parquet sandbox file exposed as table dataset.", _object_schema({"path": {"type": "string"}, "sql": {"type": "string"}}, ["path", "sql"]), lookup_data),
        ToolDefinition("generate_visualization", "Execute Python that creates a chart file under /home/user/outputs/. Use pandas/matplotlib and return generated file metadata.", _object_schema({"code": {"type": "string"}, "timeout_seconds": {"type": "integer", "minimum": 1, "maximum": 60}}, ["code"]), execute_python),
        ToolDefinition("save_memory", "Save a durable user preference or fact by key. Never store secrets.", _object_schema({"key": {"type": "string"}, "value": {"type": "string"}}, ["key", "value"]), save_memory),
        ToolDefinition("load_memory", "Load durable preferences and facts for the current user.", _object_schema({}, []), load_memory),
    ]
    for definition in definitions:
        registry.register(definition)
    return registry
