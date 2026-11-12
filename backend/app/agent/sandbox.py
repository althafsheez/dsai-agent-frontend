from __future__ import annotations

import asyncio
import hashlib
from pathlib import PurePosixPath
from threading import RLock
from typing import Any


class SandboxUnavailable(RuntimeError):
    pass


class E2BSandboxPool:
    """One isolated E2B Code Interpreter sandbox per active run."""

    def __init__(self, api_key: str | None, timeout_seconds: int = 300):
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._sandboxes: dict[str, Any] = {}
        self._output_hashes: dict[str, dict[str, str]] = {}
        self._lock = RLock()

    @staticmethod
    def _safe_path(path: str, *, writable: bool = False) -> str:
        candidate = PurePosixPath(path)
        allowed = PurePosixPath("/home/user/outputs" if writable else "/home/user")
        if not candidate.is_absolute() or candidate == allowed or allowed not in candidate.parents:
            raise ValueError("Path is outside the allowed sandbox directory.")
        if any(part.startswith(".") for part in candidate.parts):
            raise ValueError("Hidden paths are not accessible.")
        return str(candidate)

    def _start_sync(self, run_id: str) -> Any:
        if not self._api_key:
            raise SandboxUnavailable("E2B_API_KEY is not configured.")
        with self._lock:
            sandbox = self._sandboxes.get(run_id)
            if sandbox is None:
                try:
                    from e2b_code_interpreter import Sandbox
                except ImportError as exc:
                    raise SandboxUnavailable("E2B Code Interpreter is not installed.") from exc
                sandbox = Sandbox.create(timeout=self._timeout_seconds, api_key=self._api_key)
                sandbox.files.make_dir("/home/user/outputs")
                sandbox.files.make_dir("/home/user/inputs")
                self._sandboxes[run_id] = sandbox
                self._output_hashes[run_id] = {}
            return sandbox

    async def execute(self, run_id: str, code: str, timeout_seconds: int) -> dict[str, Any]:
        if not isinstance(code, str) or not code.strip():
            return {"success": False, "error": "Python code cannot be empty."}
        if not self._api_key:
            return {"success": False, "error": "E2B_API_KEY is not configured."}
        bounded_timeout = max(1, min(timeout_seconds, 60))

        def run() -> dict[str, Any]:
            sandbox = self._start_sync(run_id)
            try:
                execution = sandbox.run_code(code, timeout=bounded_timeout)
                generated = self._scan_outputs_sync(run_id, sandbox)
                error = None
                if execution.error:
                    error = f"{execution.error.name}: {execution.error.value}"[:500]
                return {
                    "success": execution.error is None,
                    "stdout": "".join(execution.logs.stdout)[:4000],
                    "stderr": "".join(execution.logs.stderr)[:1000],
                    "error": error,
                    "generated_files": generated,
                }
            except Exception:
                self._close_sync(run_id)
                return {"success": False, "error": "Sandbox execution failed."}

        try:
            return await asyncio.to_thread(run)
        except SandboxUnavailable as exc:
            return {"success": False, "error": str(exc)}

    def _scan_outputs_sync(self, run_id: str, sandbox: Any) -> list[dict[str, Any]]:
        generated: list[dict[str, Any]] = []
        known = self._output_hashes.setdefault(run_id, {})
        for entry in sandbox.files.list("/home/user/outputs"):
            entry_type = str(getattr(entry.type, "value", entry.type)).lower()
            if entry_type != "file":
                continue
            path = self._safe_path(str(entry.path), writable=True)
            content = sandbox.files.read(path, format="bytes")
            digest = hashlib.sha256(content).hexdigest()
            if known.get(path) == digest:
                continue
            known[path] = digest
            generated.append({"path": path, "name": PurePosixPath(path).name, "size_bytes": len(content), "sha256": digest})
        return generated

    async def list_files(self, run_id: str, directory: str) -> dict[str, Any]:
        try:
            safe = self._safe_path(directory)
            sandbox = await asyncio.to_thread(self._start_sync, run_id)
            entries = await asyncio.to_thread(sandbox.files.list, safe)
            return {"directory": safe, "files": sorted(str(entry.name) for entry in entries if not str(entry.name).startswith("."))}
        except (SandboxUnavailable, ValueError) as exc:
            return {"error": str(exc)}

    async def read_text(self, run_id: str, path: str) -> dict[str, Any]:
        try:
            safe = self._safe_path(path)
            sandbox = await asyncio.to_thread(self._start_sync, run_id)
            content = await asyncio.to_thread(sandbox.files.read, safe)
            text = str(content)
            return {"path": safe, "content": text[:12_000], "truncated": len(text) > 12_000}
        except (SandboxUnavailable, ValueError) as exc:
            return {"error": str(exc)}
        except Exception:
            return {"error": "Could not read the sandbox file."}

    async def write_text(self, run_id: str, path: str, content: str) -> dict[str, Any]:
        try:
            safe = self._safe_path(path, writable=True)
            if len(content.encode("utf-8")) > 1_000_000:
                return {"error": "Text output exceeds the 1 MB limit."}
            sandbox = await asyncio.to_thread(self._start_sync, run_id)
            await asyncio.to_thread(sandbox.files.write, safe, content)
            return {"success": True, "path": safe, "bytes_written": len(content.encode("utf-8"))}
        except (SandboxUnavailable, ValueError) as exc:
            return {"error": str(exc)}
        except Exception:
            return {"error": "Could not write the sandbox file."}

    async def read_output_bytes(self, run_id: str, path: str) -> bytes:
        safe = self._safe_path(path, writable=True)
        sandbox = await asyncio.to_thread(self._start_sync, run_id)
        return await asyncio.to_thread(sandbox.files.read, safe, format="bytes")

    async def upload_input(self, run_id: str, filename: str, content: bytes) -> str:
        safe_name = "".join(character for character in filename if character.isalnum() or character in "._-")[:160] or "input.bin"
        path = f"/home/user/inputs/{safe_name}"
        sandbox = await asyncio.to_thread(self._start_sync, run_id)
        await asyncio.to_thread(sandbox.files.write, path, content)
        return path

    def _close_sync(self, run_id: str) -> None:
        with self._lock:
            sandbox = self._sandboxes.pop(run_id, None)
            self._output_hashes.pop(run_id, None)
        if sandbox is not None:
            try:
                sandbox.kill()
            except Exception:
                pass

    async def close(self, run_id: str) -> None:
        await asyncio.to_thread(self._close_sync, run_id)
