"""Application storage and scope checks for the in-process agent runtime."""

from __future__ import annotations

import mimetypes
from collections.abc import Callable
from functools import partial
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.orm import Session, sessionmaker

from agentic.runtime.contracts import InputSource, ToolContext

from ..models import AgentMemory, AgentRun, Chat, FileObject, Message, Resource, ResourceLink, WorkspaceContextFile
from ..storage import LocalFileStorage
from .dataset_preview import inspect_dataset


class AgentToolAdapter:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        storage: LocalFileStorage,
    ) -> None:
        self._session_factory = session_factory
        self._storage = storage

    def _authorized_inputs(
        self, session: Session, context: ToolContext, workspace_id: str | None,
        resource_ids: tuple[str, ...] | None = None,
    ):
        scope = or_(
            and_(ResourceLink.scope_type == "chat", ResourceLink.scope_id == context.chat_id),
            and_(ResourceLink.scope_type == "message", Message.chat_id == context.chat_id),
        )
        if workspace_id:
            scope = or_(scope, and_(ResourceLink.scope_type == "workspace", ResourceLink.scope_id == workspace_id))
        run_message = aliased(Message)
        current_position = (
            select(run_message.position)
            .join(AgentRun, AgentRun.user_message_id == run_message.id)
            .where(AgentRun.id == context.run_id)
            .scalar_subquery()
        )
        removed_from_queue = select(AgentRun.id).where(
            AgentRun.user_message_id == Message.id,
            AgentRun.status == "cancelled",
            AgentRun.started_at.is_(None),
        ).exists()
        query = (
            select(Resource, FileObject)
            .join(ResourceLink, ResourceLink.resource_id == Resource.id)
            .join(FileObject, FileObject.id == Resource.file_object_id)
            .outerjoin(Message, Message.id == ResourceLink.message_id)
            .where(
                Resource.created_by == context.user_id,
                scope,
                or_(
                    Message.id.is_(None), Message.role != "user",
                    and_(Message.position <= current_position, Message.status != "queued", ~removed_from_queue),
                ),
            )
            .order_by(ResourceLink.created_at, ResourceLink.id)
        )
        if resource_ids is not None:
            query = query.where(Resource.id.in_(resource_ids))
        return session.execute(query).unique()

    async def prepare(self, context: ToolContext, input_path: Callable[[str], str]) -> dict[str, Any]:
        with self._session_factory() as session:
            chat = session.get(Chat, context.chat_id)
            inputs = [
                {
                    "id": resource.id,
                    "resource_id": resource.id,
                    "name": resource.name,
                    "resource_type": resource.resource_type,
                    "size_bytes": file.size_bytes,
                    "path": input_path(f"{resource.id}-{resource.name}"),
                }
                for resource, file in self._authorized_inputs(session, context, chat.workspace_id if chat else None)
            ]
            context.input_resources = tuple(inputs)
            workspace_context: list[dict[str, str]] = []
            if chat and chat.workspace_id:
                workspace_context = [
                    {"name": item.name, "content": item.content}
                    for item in session.scalars(select(WorkspaceContextFile).where(
                        WorkspaceContextFile.workspace_id == chat.workspace_id,
                        WorkspaceContextFile.created_by == context.user_id,
                    ).order_by(WorkspaceContextFile.name))
                ]
            prepared: dict[str, Any] = {}
            if inputs:
                prepared["files"] = inputs
            if workspace_context:
                prepared["workspace_context"] = workspace_context
            return prepared

    def resolve_inputs(self, context: ToolContext, resource_ids: tuple[str, ...]) -> dict[str, InputSource]:
        with self._session_factory() as session:
            chat = session.get(Chat, context.chat_id)
            return {
                resource.id: InputSource(
                    f"{resource.id}-{resource.name}",
                    partial(self._storage.read_bytes, file.relative_storage_path),
                )
                for resource, file in self._authorized_inputs(
                    session, context, chat.workspace_id if chat else None, resource_ids,
                )
            }

    def register_output(
        self, context: ToolContext, path: str, name: str, extension: str, digest: str, content: bytes,
    ) -> dict[str, Any]:
        resource_type = "dataset" if extension in {".csv", ".parquet", ".xlsx", ".xls"} else "artifact"
        with self._session_factory() as session:
            run_resources = session.scalars(select(Resource).where(Resource.run_id == context.run_id))
            resource = next(
                (
                    item for item in run_resources
                    if item.metadata_json.get("sandbox_path") == path
                    and item.metadata_json.get("sha256") == digest
                ),
                None,
            )
            if resource is None:
                file_object = session.scalar(select(FileObject).where(FileObject.content_hash == digest))
                if file_object is None:
                    stored = self._storage.store_bytes(content)
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
                    source="output",
                    created_by=context.user_id,
                    run_id=context.run_id,
                    metadata_json={
                        "sandbox_path": path,
                        "sha256": digest,
                        "size_bytes": len(content),
                        "producing_step_id": context.step_id,
                        "input_resource_ids": [item["resource_id"] for item in context.input_resources],
                        **inspect_dataset(name, content),
                    },
                )
                session.add(resource)
                session.flush()
                session.add(ResourceLink(
                    resource_id=resource.id,
                    scope_type="chat",
                    scope_id=context.chat_id,
                    message_id=context.assistant_message_id or None,
                ))
                session.commit()
                session.refresh(resource)
            return {
                "id": resource.id,
                "resource_type": resource.resource_type,
                "name": resource.name,
                "size_bytes": len(content),
                "origin": resource.origin,
                "producing_step_id": context.step_id,
                "input_resource_ids": [item["resource_id"] for item in context.input_resources],
            }

    async def save_memory(self, context: ToolContext, key: str, value: str) -> dict[str, Any]:
        with self._session_factory() as session:
            memory = session.scalar(select(AgentMemory).where(AgentMemory.user_id == context.user_id, AgentMemory.key == key))
            if memory is None:
                memory = AgentMemory(user_id=context.user_id, key=key, value=value)
                session.add(memory)
            else:
                memory.value = value
            session.commit()
        return {"success": True, "key": key}

    async def load_memory(self, context: ToolContext) -> dict[str, Any]:
        with self._session_factory() as session:
            memories = session.scalars(select(AgentMemory).where(AgentMemory.user_id == context.user_id).order_by(AgentMemory.updated_at.desc()).limit(50))
            return {"memories": [{"key": memory.key, "value": memory.value} for memory in memories]}
