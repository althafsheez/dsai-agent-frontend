"""Add durable workspace Markdown context files.

Revision ID: 20261113_0007
Revises: 20261113_0005
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261113_0007"
down_revision: str | None = "20261113_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("workspace_context_files"):
        op.create_table(
            "workspace_context_files",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("workspace_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=240), nullable=False),
            sa.Column("content", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_by", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("workspace_id", "name", name="uq_workspace_context_name"),
        )
        op.create_index(op.f("ix_workspace_context_files_workspace_id"), "workspace_context_files", ["workspace_id"], unique=False)
        op.create_index(op.f("ix_workspace_context_files_created_by"), "workspace_context_files", ["created_by"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("workspace_context_files"):
        op.drop_index(op.f("ix_workspace_context_files_created_by"), table_name="workspace_context_files")
        op.drop_index(op.f("ix_workspace_context_files_workspace_id"), table_name="workspace_context_files")
        op.drop_table("workspace_context_files")
