"""Initial modular backend records.

Revision ID: 20261109_0001
Revises:
"""
from collections.abc import Sequence

from alembic import op

from app import models  # noqa: F401
from app.db import Base


revision: str = "20261109_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The baseline is derived from the reviewed SQLAlchemy metadata. Later
    # revisions must use explicit Alembic operations for incremental changes.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
