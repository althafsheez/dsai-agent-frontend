from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..models import User
from sqlalchemy import select

from ..models import Chat, Workflow, WorkflowChat, WorkspaceContextFile
from ..schemas import (
    ChatResponse,
    WorkspaceContextFileCreate,
    WorkspaceContextFileResponse,
    WorkspaceContextFileUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
    WorkflowChatCreate,
    WorkflowCreate,
    WorkflowResponse,
)
from ..services.records import create_workspace, delete_workspace, list_workspaces, require_workspace, update_workspace


router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.get("")
async def get_workspaces(
    session: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    return {
        "items": [WorkspaceResponse.model_validate(item) for item in list_workspaces(session, user)],
        "next_cursor": None,
    }


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def post_workspace(
    data: WorkspaceCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(create_workspace(session, user, data))


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(require_workspace(session, user, workspace_id))


@router.get("/{workspace_id}/chats")
async def get_workspace_chats(
    workspace_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_workspace(session, user, workspace_id)
    chats = session.scalars(select(Chat).where(
        Chat.workspace_id == workspace_id,
        Chat.created_by == user.id,
        Chat.deleted_at.is_(None),
    ).order_by(Chat.updated_at.desc(), Chat.id.desc()))
    return {"items": [ChatResponse.model_validate(chat) for chat in chats], "next_cursor": None}


@router.get("/{workspace_id}/context-files")
async def get_context_files(
    workspace_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_workspace(session, user, workspace_id)
    files = session.scalars(select(WorkspaceContextFile).where(
        WorkspaceContextFile.workspace_id == workspace_id,
        WorkspaceContextFile.created_by == user.id,
    ).order_by(WorkspaceContextFile.name, WorkspaceContextFile.id))
    return {"items": [WorkspaceContextFileResponse.model_validate(item) for item in files], "next_cursor": None}


@router.post("/{workspace_id}/context-files", response_model=WorkspaceContextFileResponse, status_code=status.HTTP_201_CREATED)
async def post_context_file(
    workspace_id: str,
    data: WorkspaceContextFileCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceContextFileResponse:
    require_workspace(session, user, workspace_id)
    name = data.name.strip()
    if not name:
        from ..errors import APIError
        raise APIError(422, "empty_context_name", "Context file name cannot be blank.")
    if not name.endswith(".md"):
        name = f"{name}.md"
    item = WorkspaceContextFile(workspace_id=workspace_id, name=name, content=data.content, created_by=user.id)
    session.add(item)
    session.commit()
    session.refresh(item)
    return WorkspaceContextFileResponse.model_validate(item)


@router.patch("/{workspace_id}/context-files/{file_id}", response_model=WorkspaceContextFileResponse)
async def patch_context_file(
    workspace_id: str,
    file_id: str,
    data: WorkspaceContextFileUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceContextFileResponse:
    require_workspace(session, user, workspace_id)
    item = session.get(WorkspaceContextFile, file_id)
    if item is None or item.workspace_id != workspace_id or item.created_by != user.id:
        from ..errors import APIError
        raise APIError(404, "context_file_not_found", "Context file not found.")
    if data.name is not None:
        item.name = data.name.strip() if data.name.strip().endswith(".md") else f"{data.name.strip()}.md"
    if data.content is not None:
        item.content = data.content
    session.commit()
    session.refresh(item)
    return WorkspaceContextFileResponse.model_validate(item)


@router.delete("/{workspace_id}/context-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_context_file(
    workspace_id: str,
    file_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    require_workspace(session, user, workspace_id)
    item = session.get(WorkspaceContextFile, file_id)
    if item is not None and item.workspace_id == workspace_id and item.created_by == user.id:
        session.delete(item)
        session.commit()


@router.get("/{workspace_id}/workflows")
async def get_workspace_workflows(
    workspace_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_workspace(session, user, workspace_id)
    workflows = session.scalars(select(Workflow).where(
        Workflow.workspace_id == workspace_id,
        Workflow.created_by == user.id,
    ).order_by(Workflow.updated_at.desc(), Workflow.id.desc()))
    return {"items": [WorkflowResponse.model_validate(item) for item in workflows], "next_cursor": None}


@router.post("/{workspace_id}/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def post_workspace_workflow(
    workspace_id: str,
    data: WorkflowCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkflowResponse:
    require_workspace(session, user, workspace_id)
    item = Workflow(workspace_id=workspace_id, created_by=user.id, name=data.name.strip(), description=data.description)
    session.add(item)
    session.commit()
    session.refresh(item)
    return WorkflowResponse.model_validate(item)


@router.get("/{workspace_id}/workflows/{workflow_id}/chats")
async def get_workflow_chats(
    workspace_id: str,
    workflow_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_workspace(session, user, workspace_id)
    workflow = session.get(Workflow, workflow_id)
    if workflow is None or workflow.workspace_id != workspace_id or workflow.created_by != user.id:
        from ..errors import APIError
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    rows = session.execute(select(Chat, WorkflowChat.relation_type).join(WorkflowChat, WorkflowChat.chat_id == Chat.id).where(WorkflowChat.workflow_id == workflow_id)).all()
    return {"items": [{"chat": ChatResponse.model_validate(chat), "relation_type": relation_type} for chat, relation_type in rows], "next_cursor": None}


@router.post("/{workspace_id}/workflows/{workflow_id}/chats", status_code=status.HTTP_201_CREATED)
async def post_workflow_chat(
    workspace_id: str,
    workflow_id: str,
    data: WorkflowChatCreate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    require_workspace(session, user, workspace_id)
    workflow = session.get(Workflow, workflow_id)
    chat = session.get(Chat, data.chat_id)
    if workflow is None or workflow.workspace_id != workspace_id or workflow.created_by != user.id:
        from ..errors import APIError
        raise APIError(404, "workflow_not_found", "Workflow not found.")
    if chat is None or chat.created_by != user.id:
        from ..errors import APIError
        raise APIError(404, "chat_not_found", "Chat not found.")
    item = session.get(WorkflowChat, {"workflow_id": workflow_id, "chat_id": data.chat_id})
    if item is None:
        item = WorkflowChat(workflow_id=workflow_id, chat_id=data.chat_id, relation_type=data.relation_type)
        session.add(item)
        session.commit()
    return {"workflow_id": workflow_id, "chat_id": data.chat_id, "relation_type": item.relation_type}


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def patch_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(update_workspace(session, user, workspace_id, data))


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace(
    workspace_id: str,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    delete_workspace(session, user, workspace_id)
