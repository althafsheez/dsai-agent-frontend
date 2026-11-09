from __future__ import annotations

from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    request_id = request.headers.get("X-Request-Id", str(uuid4()))
    error: dict[str, object] = {
        "code": exc.code,
        "message": exc.message,
        "request_id": request_id,
    }
    if exc.details:
        error["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content={"error": error})
