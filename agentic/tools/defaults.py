from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

import httpx

from ..execution.e2b import E2BSandboxPool, SandboxUnavailable
from ..runtime.contracts import ToolContext, ToolHost
from .registry import ToolDefinition, ToolHandler, ToolRegistry


def _object_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


logger = logging.getLogger("agentic.performance")
_UNAVAILABLE_INPUT = "An input resource is missing or unavailable in this chat. Choose an authorized resource from the file inventory."


@dataclass
class RunInputs:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    paths: dict[str, str] = field(default_factory=dict)
    closed: bool = False
    uploaded: int = 0
    bytes_uploaded: int = 0
    staging_ms: float = 0


def _resolve_selection(context: ToolContext, resource_ids: list[str]) -> tuple[dict[str, Any], ...]:
    inventory = {file["resource_id"]: file for file in context.input_resources}
    if any(resource_id not in inventory for resource_id in resource_ids):
        raise ValueError(_UNAVAILABLE_INPUT)
    return tuple(inventory[resource_id] for resource_id in dict.fromkeys(resource_ids))


def _python_inputs(arguments: dict[str, Any], context: ToolContext) -> tuple[dict[str, Any], ...]:
    resource_ids = arguments.get("resource_ids", [])
    if not isinstance(resource_ids, list) or any(not isinstance(item, str) or not item for item in resource_ids):
        raise ValueError("resource_ids must be a list of resource IDs from the file inventory.")
    return _resolve_selection(context, resource_ids)


def _file_inputs(arguments: dict[str, Any], context: ToolContext) -> tuple[dict[str, Any], ...]:
    path = arguments.get("path")
    resource_id = arguments.get("resource_id")
    if resource_id is not None:
        if not isinstance(resource_id, str) or not resource_id:
            raise ValueError(_UNAVAILABLE_INPUT)
        files = _resolve_selection(context, [resource_id])
        if path is not None and E2BSandboxPool.safe_input_path(str(path)) != files[0]["path"]:
            raise ValueError("Use resource_id alone, or use the matching sandbox path from the inventory.")
        return files
    if not isinstance(path, str) or not path.strip():
        raise ValueError("Provide resource_id or a sandbox path.")
    safe = E2BSandboxPool.safe_input_path(path)
    if PurePosixPath(safe).is_relative_to("/home/user/inputs"):
        files = tuple(file for file in context.input_resources if file["path"] == safe)
        if len(files) != 1:
            raise ValueError(_UNAVAILABLE_INPUT)
        return files
    return ()


def _lookup_sql(arguments: dict[str, Any]) -> str:
    sql = str(arguments.get("sql", "")).strip()
    if not re.match(r"(?is)^select\b", sql) or ";" in sql or re.search(r"(?is)\b(insert|update|delete|drop|alter|attach|copy|install|load|pragma|call)\b", sql):
        raise ValueError("Only one read-only SELECT query is allowed.")
    return sql


def _lookup_inputs(arguments: dict[str, Any], context: ToolContext) -> tuple[dict[str, Any], ...]:
    _lookup_sql(arguments)
    return _file_inputs(arguments, context)


def _selected_path(arguments: dict[str, Any], context: ToolContext) -> str:
    if context.input_resources:
        return str(context.input_resources[0]["path"])
    return E2BSandboxPool.safe_input_path(str(arguments["path"]))


def build_tool_registry(
    sandbox_pool: E2BSandboxPool,
    host: ToolHost,
    *,
    tavily_api_key: str | None,
) -> ToolRegistry:
    staged: dict[str, RunInputs] = defaultdict(RunInputs)

    async def prepare(context: ToolContext) -> dict[str, Any]:
        return await host.prepare(context, sandbox_pool.input_path)

    async def cleanup(context: ToolContext) -> None:
        state = staged.get(context.run_id)
        if state is None:
            await sandbox_pool.close(context.run_id)
            return
        async with state.lock:
            state.closed = True
            try:
                await sandbox_pool.close(context.run_id)
            finally:
                logger.info(
                    "e2b_staging_total uploaded=%d bytes=%d duration_ms=%.1f",
                    state.uploaded, state.bytes_uploaded, state.staging_ms,
                )
                staged.pop(context.run_id, None)

    async def ensure_inputs(context: ToolContext, resource_ids: tuple[str, ...]) -> None:
        state = staged[context.run_id]
        async with state.lock:
            if state.closed:
                raise SandboxUnavailable("The run sandbox is closed.")
            # Python can still read files staged by earlier calls, so recheck those IDs too.
            checked_ids = tuple(dict.fromkeys((*state.paths, *resource_ids)))
            if not checked_ids:
                return
            started = time.perf_counter()
            uploaded = total_bytes = 0
            try:
                sources = host.resolve_inputs(context, checked_ids)
                if any(
                    resource_id not in sources or sandbox_pool.input_path(sources[resource_id].filename) != path
                    for resource_id, path in state.paths.items()
                ):
                    await sandbox_pool.close(context.run_id)
                    state.paths.clear()
                    raise ValueError(_UNAVAILABLE_INPUT)
                expected_paths = {file["resource_id"]: file["path"] for file in context.input_resources}
                if any(
                    resource_id not in sources
                    or sandbox_pool.input_path(sources[resource_id].filename) != expected_paths[resource_id]
                    for resource_id in resource_ids
                ):
                    raise ValueError(_UNAVAILABLE_INPUT)
                for resource_id in resource_ids:
                    if resource_id in state.paths:
                        continue
                    source = sources[resource_id]
                    content = await asyncio.to_thread(source.read_bytes)
                    path = await sandbox_pool.upload_input(context.run_id, source.filename, content)
                    if path != expected_paths[resource_id]:
                        await sandbox_pool.close(context.run_id)
                        state.paths.clear()
                        raise SandboxUnavailable("The uploaded path did not match the file inventory.")
                    state.paths[resource_id] = path
                    uploaded += 1
                    total_bytes += len(content)
            finally:
                duration_ms = (time.perf_counter() - started) * 1000
                state.uploaded += uploaded
                state.bytes_uploaded += total_bytes
                state.staging_ms += duration_ms
                logger.info(
                    "e2b_staging requested=%d uploaded=%d bytes=%d duration_ms=%.1f",
                    len(resource_ids), uploaded, total_bytes, duration_ms,
                )

    def with_inputs(handler: ToolHandler) -> ToolHandler:
        async def execute(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
            ids = tuple(file["resource_id"] for file in context.input_resources)
            try:
                await ensure_inputs(context, ids)
            except (SandboxUnavailable, ValueError) as exc:
                return {"error": str(exc)}
            except OSError:
                return {"error": "Could not stage a requested file. Check that the original file is still available."}
            return await handler(arguments, context)

        return execute

    registry = ToolRegistry(prepare=prepare, cleanup=cleanup)

    async def persist_generated(result: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        resources: list[dict[str, Any]] = []
        registration_failures: list[dict[str, str]] = []
        generated_files = result.get("generated_files", [])
        if not generated_files:
            return result
        for generated in generated_files:
            path = str(generated.get("path", ""))
            name = PurePosixPath(path).name
            extension = PurePosixPath(name).suffix.lower()
            if extension not in {".csv", ".parquet", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".pdf", ".txt", ".md", ".json", ".py", ".js", ".ts", ".tsx", ".jsx", ".sql", ".html", ".css", ".yaml", ".yml", ".sh", ".r"}:
                continue
            try:
                content = await sandbox_pool.read_output_bytes(context.run_id, path)
                if len(content) > 25 * 1024 * 1024:
                    registration_failures.append({"path": path, "error": "Output exceeds the 25 MB limit."})
                    continue
                digest = str(generated.get("sha256", ""))
                resource = host.register_output(context, path, name, extension, digest, content)
                sandbox_pool.acknowledge_output(context.run_id, path, digest)
                resources.append(resource)
            except Exception as exc:
                registration_failures.append({"path": path, "error": f"Could not register output: {type(exc).__name__}."})
        return {**result, "resources": resources, "registration_failures": registration_failures}

    async def web_search(arguments: dict[str, Any], _: ToolContext) -> dict[str, Any]:
        query = str(arguments.get("query", "")).strip()
        count = max(1, min(int(arguments.get("num_results", 5)), 10))
        if not query:
            return {"error": "Search query is required."}
        if not tavily_api_key:
            return {"error": "TAVILY_API_KEY is not configured."}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    json={"api_key": tavily_api_key, "query": query, "max_results": count},
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
        if "FileNotFoundError" in str(result.get("error") or ""):
            result["error"] += (
                " For a chat or workspace file, retry with its ID in resource_ids "
                "and open the exact sandbox path from the inventory."
            )
        return await persist_generated(result, context)

    async def list_files(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await sandbox_pool.list_files(context.run_id, str(arguments.get("directory", "/home/user/outputs")))

    async def read_file(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await sandbox_pool.read_text(context.run_id, _selected_path(arguments, context))

    async def write_file(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        result = await sandbox_pool.write_text(context.run_id, str(arguments.get("path", "")), str(arguments.get("content", "")))
        if result.get("success"):
            result = {**result, "generated_files": await sandbox_pool.collect_outputs(context.run_id)}
            return await persist_generated(result, context)
        return result

    async def lookup_data(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        path = _selected_path(arguments, context)
        sql = _lookup_sql(arguments)
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
        result = await persist_generated(await sandbox_pool.execute(context.run_id, code, 30), context)
        if not result.get("success"):
            return result
        try:
            rows = json.loads(str(result.get("stdout", "[]")))
            if not isinstance(rows, list):
                return {**result, "error": "Dataset query returned an unreadable result."}
            return {**result, "rows": rows[:50], "truncated": len(rows) > 50, "sql": sql, "code": code}
        except json.JSONDecodeError:
            return {**result, "error": "Dataset query returned an unreadable result."}

    async def save_memory(arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        key = str(arguments.get("key", "")).strip()[:100]
        value = str(arguments.get("value", "")).strip()[:4000]
        if not key or not value:
            return {"error": "Memory key and value are required."}
        return await host.save_memory(context, key, value)

    async def load_memory(_: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        return await host.load_memory(context)

    python_schema = _object_schema({
        "code": {"type": "string"},
        "timeout_seconds": {"type": "integer", "minimum": 1, "maximum": 60},
        "resource_ids": {
            "type": "array", "items": {"type": "string"},
            "description": "IDs of all chat or workspace files this code reads. Omit for code without input files.",
        },
    }, ["code"])
    file_properties = {
        "resource_id": {"type": "string", "description": "Authorized resource ID from the inventory."},
        "path": {"type": "string", "description": "Exact inventory path or a path to a file already in this sandbox."},
    }
    definitions = [
        ToolDefinition("web_search", "Search the public web for current information.", _object_schema({"query": {"type": "string"}, "num_results": {"type": "integer", "minimum": 1, "maximum": 10}}, ["query"]), web_search),
        ToolDefinition(
            "execute_python", "Execute Python in E2B. Declare input resource IDs and use their listed paths. Save generated files under /home/user/outputs/.",
            python_schema, with_inputs(execute_python), _python_inputs,
        ),
        ToolDefinition(
            "list_files", "List files physically present in the sandbox. The file inventory includes additional authorized files that can be staged by ID.",
            _object_schema({"directory": {"type": "string"}}, []), with_inputs(list_files),
        ),
        ToolDefinition(
            "read_file", "Read bounded UTF-8 text. Supply resource_id or path.",
            _object_schema(file_properties, []), with_inputs(read_file), _file_inputs,
        ),
        ToolDefinition("write_file", "Write a bounded text file under /home/user/outputs/ in the E2B sandbox.", _object_schema({"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]), with_inputs(write_file)),
        ToolDefinition(
            "lookup_data", "Run one read-only SELECT against a CSV or Parquet file exposed as dataset. Supply resource_id or path.",
            _object_schema({**file_properties, "sql": {"type": "string"}}, ["sql"]), with_inputs(lookup_data), _lookup_inputs,
        ),
        ToolDefinition(
            "generate_visualization", "Create a chart with Python under /home/user/outputs/. Declare input resource IDs and use their listed paths.",
            python_schema, with_inputs(execute_python), _python_inputs,
        ),
        ToolDefinition("save_memory", "Save a durable user preference or fact by key. Never store secrets.", _object_schema({"key": {"type": "string"}, "value": {"type": "string"}}, ["key", "value"]), save_memory),
        ToolDefinition("load_memory", "Load durable preferences and facts for the current user.", _object_schema({}, []), load_memory),
    ]
    for definition in definitions:
        registry.register(definition)
    return registry
