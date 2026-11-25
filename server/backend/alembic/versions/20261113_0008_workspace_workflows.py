"""Add workspace-owned workflows and durable workflow/chat references.

Revision ID: 20261113_0008
Revises: 20261113_0007
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261113_0008"
down_revision: str | None = "20261113_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("workflows"):
        op.create_table(
            "workflows",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("workspace_id", sa.String(length=36), nullable=True),
            sa.Column("created_by", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_workflows_workspace_id"), "workflows", ["workspace_id"], unique=False)
        op.create_index(op.f("ix_workflows_created_by"), "workflows", ["created_by"], unique=False)
        op.create_index(op.f("ix_workflows_status"), "workflows", ["status"], unique=False)
    if not inspector.has_table("workflow_chats"):
        op.create_table(
            "workflow_chats",
            sa.Column("workflow_id", sa.String(length=36), nullable=False),
            sa.Column("chat_id", sa.String(length=36), nullable=False),
            sa.Column("relation_type", sa.String(length=24), nullable=False, server_default="referenced"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"]),
            sa.ForeignKeyConstraint(["chat_id"], ["chats.id"]),
            sa.PrimaryKeyConstraint("workflow_id", "chat_id"),
            sa.UniqueConstraint("workflow_id", "chat_id", name="uq_workflow_chat"),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("workflow_chats"):
        op.drop_table("workflow_chats")
    if inspector.has_table("workflows"):
        op.drop_index(op.f("ix_workflows_status"), table_name="workflows")
        op.drop_index(op.f("ix_workflows_created_by"), table_name="workflows")
        op.drop_index(op.f("ix_workflows_workspace_id"), table_name="workflows")
        op.drop_table("workflows")
