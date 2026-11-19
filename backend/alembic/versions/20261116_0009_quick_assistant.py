"""Persist independent Quick Assistant conversations.

Revision ID: 20261116_0009
Revises: 20261113_0008
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261116_0009"
down_revision: str | None = "20261113_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("quick_messages"):
        return
    op.create_table(
        "quick_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("context_type", sa.String(length=16), nullable=False),
        sa.Column("context_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("client_request_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("context_type", "context_id", "user_id", "position", name="uq_quick_message_position"),
        sa.UniqueConstraint("context_type", "context_id", "user_id", "client_request_id", name="uq_quick_message_request"),
    )
    op.create_index(op.f("ix_quick_messages_context_type"), "quick_messages", ["context_type"], unique=False)
    op.create_index(op.f("ix_quick_messages_context_id"), "quick_messages", ["context_id"], unique=False)
    op.create_index(op.f("ix_quick_messages_user_id"), "quick_messages", ["user_id"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("quick_messages"):
        op.drop_table("quick_messages")
