"""Add user-scoped agent memory.

Revision ID: 20261112_0002
Revises: 20261109_0001
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261112_0002"
down_revision: str | None = "20261109_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("agent_memories"):
        return
    op.create_table(
        "agent_memories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key", name="uq_agent_memory_user_key"),
    )
    op.create_index(op.f("ix_agent_memories_user_id"), "agent_memories", ["user_id"], unique=False)


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("agent_memories"):
        return
    op.drop_index(op.f("ix_agent_memories_user_id"), table_name="agent_memories")
    op.drop_table("agent_memories")
