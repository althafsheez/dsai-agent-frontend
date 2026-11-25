"""Add shared workflow definitions and run records (stored server-side).

Revision ID: 20261123_0015
Revises: 20261123_0014
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261123_0015"
down_revision: str | None = "20261123_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "workflow_definitions" not in tables:
        op.create_table(
            "workflow_definitions",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("owner_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("state", sa.String(length=16), nullable=False, server_default="draft"),
            sa.Column("trigger", sa.JSON(), nullable=False),
            sa.Column("steps", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_workflow_definitions_owner_id", "workflow_definitions", ["owner_id"])
    if "workflow_run_records" not in tables:
        op.create_table(
            "workflow_run_records",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("workflow_id", sa.String(length=64), nullable=False),
            sa.Column("workflow_name", sa.String(length=160), nullable=False),
            sa.Column("trigger", sa.String(length=16), nullable=False),
            sa.Column("plan", sa.JSON(), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_workflow_run_records_workflow_id", "workflow_run_records", ["workflow_id"])


def downgrade() -> None:
    op.drop_index("ix_workflow_run_records_workflow_id", table_name="workflow_run_records")
    op.drop_table("workflow_run_records")
    op.drop_index("ix_workflow_definitions_owner_id", table_name="workflow_definitions")
    op.drop_table("workflow_definitions")
