"""Persist chat unread state for History and Activity.

Revision ID: 20261113_0005
Revises: 20261113_0004
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261113_0005"
down_revision: str | None = "20261113_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("chats")}
    if "is_unread" not in columns:
        op.add_column("chats", sa.Column("is_unread", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.create_index(op.f("ix_chats_is_unread"), "chats", ["is_unread"], unique=False)


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("chats")}
    if "is_unread" in columns:
        op.drop_index(op.f("ix_chats_is_unread"), table_name="chats")
        with op.batch_alter_table("chats") as batch:
            batch.drop_column("is_unread")
