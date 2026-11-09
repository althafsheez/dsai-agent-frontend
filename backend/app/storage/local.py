from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4


@dataclass(frozen=True)
class StoredFile:
    content_hash: str
    relative_path: str
    size_bytes: int


class LocalFileStorage:
    """Stores bytes under generated names; callers never supply filesystem paths."""

    def __init__(self, root: Path):
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def store_bytes(self, content: bytes) -> StoredFile:
        digest = hashlib.sha256(content).hexdigest()
        relative = Path(digest[:2]) / f"{uuid4().hex}.bin"
        destination = (self._root / relative).resolve()
        if self._root not in destination.parents:
            raise ValueError("Resolved storage path escaped the storage root.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".partial")
        temporary.write_bytes(content)
        temporary.replace(destination)
        return StoredFile(content_hash=digest, relative_path=relative.as_posix(), size_bytes=len(content))

    def read_bytes(self, relative_path: str) -> bytes:
        unresolved = self._root / relative_path
        current = self._root
        for part in Path(relative_path).parts:
            current = current / part
            if current.is_symlink():
                raise ValueError("Invalid storage path.")
        candidate = unresolved.resolve()
        if self._root not in candidate.parents:
            raise ValueError("Invalid storage path.")
        return candidate.read_bytes()
