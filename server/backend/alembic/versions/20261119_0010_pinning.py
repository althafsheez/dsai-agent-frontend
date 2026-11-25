"""Persist pinned state for chats and workspaces.

Revision ID: 20261119_0010
Revises: 20261116_0009
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261119_0010"
down_revision: str | None = "20261116_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("chats", "workspaces")


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table in TABLES:
        if "pinned_at" not in {column["name"] for column in inspector.get_columns(table)}:
            op.add_column(table, sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table in TABLES:
        if "pinned_at" in {column["name"] for column in inspector.get_columns(table)}:
            with op.batch_alter_table(table) as batch:
                batch.drop_column("pinned_at")
