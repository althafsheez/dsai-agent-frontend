from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import APIError
from ..models import User


DEMO_USERS = (
    User(id="user-you", name="You", initials="YO"),
    User(id="user-shared", name="Shared Demo", initials="SD"),
)


def seed_demo_users(session: Session) -> None:
    for demo in DEMO_USERS:
        if session.get(User, demo.id) is None:
            session.add(User(id=demo.id, name=demo.name, initials=demo.initials))
    session.commit()


def require_demo_user(session: Session, user_id: str | None) -> User:
    selected_id = user_id or "user-you"
    user = session.scalar(select(User).where(User.id == selected_id))
    if user is None:
        raise APIError(401, "invalid_demo_user", "Unknown demo user identity.")
    return user
