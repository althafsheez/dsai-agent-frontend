"""Add independent Quick Assistant conversations (tabs) per chat.

Revision ID: 20261121_0012
Revises: 20261120_0011
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261121_0012"
down_revision: str | None = "20261120_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("quick_messages")}
    if "thread_id" not in columns:
        with op.batch_alter_table("quick_messages") as batch:
            batch.add_column(sa.Column("thread_id", sa.String(length=36), nullable=False, server_default="main"))
            batch.create_index("ix_quick_messages_thread_id", ["thread_id"])


def downgrade() -> None:
    with op.batch_alter_table("quick_messages") as batch:
        batch.drop_index("ix_quick_messages_thread_id")
        batch.drop_column("thread_id")
