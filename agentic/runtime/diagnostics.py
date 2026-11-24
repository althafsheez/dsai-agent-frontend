"""Public diagnostics built from classified failures, never exception bodies."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Mapping
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

import httpx

HTTP_ERRORS = {
    400: ("invalid_request", "Invalid request"),
    401: ("authentication", "Authentication failed"),
    403: ("permission", "Access denied"),
    404: ("not_found", "Resource not found"),
    408: ("timeout", "Request timed out"),
    429: ("rate_limit", "Rate limit exceeded"),
    500: ("service_error", "Internal service error"),
    502: ("service_error", "Bad gateway"),
    503: ("unavailable", "Service unavailable"),
    504: ("timeout", "Gateway timed out"),
}
GEMINI_HTTP_ATTEMPTS = 3
GEMINI_RETRY_STATUSES = (500, 502, 503, 504)


@dataclass
class GeminiRequests:
    count: int = 0

    async def stream(self, client: Any, **kwargs: Any) -> AsyncIterator[Any]:
        token = _gemini_requests.set(self)
        try:
            chunks = await client.aio.models.generate_content_stream(**kwargs)
        finally:
            _gemini_requests.reset(token)
        while True:
            token = _gemini_requests.set(self)
            try:
                chunk = await anext(chunks, None)
            finally:
                _gemini_requests.reset(token)
            if chunk is None:
                return
            yield chunk


_gemini_requests: ContextVar[GeminiRequests | None] = ContextVar("gemini_requests", default=None)


async def count_gemini_request(_request: httpx.Request) -> None:
    requests = _gemini_requests.get()
    if requests is not None:
        requests.count += 1


POSTGRES_TOOLS = {"list_database_tables", "describe_database_table", "query_database"}
E2B_TOOLS = {"execute_python", "generate_visualization", "list_files", "read_file", "write_file", "lookup_data"}
# Tool trace text is public. Remove common credential forms before serializing it.
SECRET_TEXT = re.compile(
    r"""(?i)(?:[a-z][a-z0-9+.-]*://[^\s/'"<>]+:[^\s/@'"<>]+@[^\s'"<>]+"""
    r"""|(?:postgres(?:ql)?(?:\+[a-z0-9_]+)?|jdbc:postgresql)://[^\s'"<>]+"""
    r"""|\b(?:authorization|proxy-authorization)\s*[:=]\s*[^\r\n]+"""
    r"""|\b(?:api[_-]?key|password|passwd|secret|access[_-]?token|database[_-]?url|connection[_-]?string|system[_-]?prompt)['"]?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)"""
    r"""|\b(?:AIza[\w-]{30,}|e2b_[\w-]{16,}|sk-[\w-]{16,})\b)"""
)
SECRET_FIELDS = re.compile(r"(?i)(?:authorization|password|passwd|api[_-]?key|access[_-]?token|secret|connection[_-]?string|database[_-]?url|system[_-]?prompt)")


def public_tool_value(value: Any) -> Any:
    if isinstance(value, str):
        return SECRET_TEXT.sub("[redacted]", value)
    if isinstance(value, Mapping):
        return {key: "[redacted]" if SECRET_FIELDS.search(str(key)) else public_tool_value(item)
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [public_tool_value(item) for item in value]
    return value


def diagnostic(component: str, code: str, category: str, message: str, stage: str, *,
               retryable: bool = False, **metadata: Any) -> dict[str, Any]:
    return {
        "component": component, "code": code, "category": category, "message": message,
        "stage": stage, "retryable": retryable,
        **{key: value for key, value in metadata.items() if value is not None},
    }


def http_status(exc: Exception) -> int | None:
    response = getattr(exc, "response", None)
    for value in (getattr(exc, "code", None), getattr(exc, "status_code", None), getattr(response, "status_code", None)):
        if type(value) is int and 400 <= value <= 599:
            return value
    return None


def upstream_request_id(exc: Exception) -> str | None:
    headers = getattr(getattr(exc, "response", None), "headers", None) or {}
    for name in ("x-goog-request-id", "x-request-id"):
        value = headers.get(name)
        if isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{5,79}", value) and not SECRET_TEXT.search(value):
            return value
    return None


def is_timeout(exc: Exception) -> bool:
    # The E2B SDK defines its own TimeoutException.
    return isinstance(exc, (TimeoutError, httpx.TimeoutException)) or type(exc).__name__ == "TimeoutException"


def gemini_diagnostic(exc: Exception, *, turn: int | None = None, duration_ms: int | None = None,
                      stage: str = "model_generation", requests: int = 0) -> dict[str, Any]:
    status = http_status(exc)
    if status:
        category, message = HTTP_ERRORS.get(status, ("service_error", "Request failed"))
        code = f"gemini_http_{status}"
    elif is_timeout(exc):
        code, category, message = "gemini_timeout", "timeout", "Request timed out"
    elif isinstance(exc, httpx.TransportError):
        code, category, message = "gemini_transport_error", "connection", "Connection to Gemini failed"
    else:
        code, category, message = "gemini_generation_failed", "execution", "Response generation failed"
    retries = requests - 1 if requests else None
    return diagnostic(
        "Gemini API", code, category, message, stage,
        retryable=bool(status in (408, 429) or (status and status >= 500) or category in {"timeout", "connection"}),
        http_status=status, turn=turn, duration_ms=duration_ms, request_id=upstream_request_id(exc),
        retry_attempts=retries,
        retry_limit=GEMINI_HTTP_ATTEMPTS - 1, development={"Exception type": type(exc).__name__},
    )


def tool_component(name: str) -> str:
    if name in POSTGRES_TOOLS:
        return "PostgreSQL"
    if name in E2B_TOOLS:
        return "E2B"
    return "Agent"


def unexpected_diagnostic(exc: Exception, *, component: str = "Agent", stage: str = "run_execution",
                          **metadata: Any) -> dict[str, Any]:
    timeout = is_timeout(exc)
    return diagnostic(
        component, "execution_timeout" if timeout else "execution_failed",
        "timeout" if timeout else "execution", "Execution timed out" if timeout else "Execution failed",
        stage, retryable=timeout, development={"Exception type": type(exc).__name__}, **metadata,
    )
