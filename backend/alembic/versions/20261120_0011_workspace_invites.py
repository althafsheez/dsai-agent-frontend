"""Persist workspace share invitations.

Revision ID: 20261120_0011
Revises: 20261119_0010
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261120_0011"
down_revision: str | None = "20261119_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("workspace_invites"):
        op.create_table(
            "workspace_invites",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("workspace_id", sa.String(length=36), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("invited_by", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("workspace_id", "email", name="uq_workspace_invite_email"),
        )
        op.create_index(op.f("ix_workspace_invites_workspace_id"), "workspace_invites", ["workspace_id"], unique=False)
        op.create_index(op.f("ix_workspace_invites_invited_by"), "workspace_invites", ["invited_by"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("workspace_invites"):
        op.drop_index(op.f("ix_workspace_invites_invited_by"), table_name="workspace_invites")
        op.drop_index(op.f("ix_workspace_invites_workspace_id"), table_name="workspace_invites")
        op.drop_table("workspace_invites")
