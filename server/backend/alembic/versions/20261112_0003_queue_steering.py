"""Add persisted steering instructions.

Revision ID: 20261112_0003
Revises: 20261112_0002
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261112_0003"
down_revision: str | None = "20261112_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("steering_instructions"):
        return
    op.create_table(
        "steering_instructions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("checkpoint", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id"),
    )
    op.create_index(op.f("ix_steering_instructions_run_id"), "steering_instructions", ["run_id"], unique=False)
    op.create_index(op.f("ix_steering_instructions_status"), "steering_instructions", ["status"], unique=False)


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("steering_instructions"):
        return
    op.drop_index(op.f("ix_steering_instructions_status"), table_name="steering_instructions")
    op.drop_index(op.f("ix_steering_instructions_run_id"), table_name="steering_instructions")
    op.drop_table("steering_instructions")
