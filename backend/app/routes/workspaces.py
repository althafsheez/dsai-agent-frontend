from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ..models import User
from ..schemas import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate
from ..services.records import create_workspace, delete_workspace, list_workspaces, update_workspace


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
