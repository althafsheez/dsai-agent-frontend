from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .models import User
from .services.identity import require_demo_user


async def get_db(request: Request) -> AsyncIterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


async def get_current_user(
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
    session: Session = Depends(get_db),
) -> User:
    return require_demo_user(session, x_demo_user_id)
