"""Real workflow runs: per-step results, status, schedule bookkeeping and the prompt a workflow came from.

The earlier runs were simulated timelines with no output, so they are removed; workflow definitions are kept.

Revision ID: 20261124_0018
Revises: 20261124_0017
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261124_0018"
down_revision: str | None = "20261124_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    defs = {column["name"] for column in inspector.get_columns("workflow_definitions")}
    runs = {column["name"] for column in inspector.get_columns("workflow_run_records")}
    if "prompt" not in defs:
        op.add_column("workflow_definitions", sa.Column("prompt", sa.Text(), nullable=False, server_default=""))
    if "next_run_at" not in defs:
        op.add_column("workflow_definitions", sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True))
    if "last_run_at" not in defs:
        op.add_column("workflow_definitions", sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True))
    if "status" not in runs:
        op.add_column("workflow_run_records", sa.Column("status", sa.String(16), nullable=False, server_default="legacy"))
        op.execute("DELETE FROM workflow_run_records WHERE status = 'legacy'")
    if "results" not in runs:
        op.add_column("workflow_run_records", sa.Column("results", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    if "finished_at" not in runs:
        op.add_column("workflow_run_records", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    if "error" not in runs:
        op.add_column("workflow_run_records", sa.Column("error", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("workflow_run_records") as batch:
        for name in ("error", "finished_at", "results", "status"):
            batch.drop_column(name)
    with op.batch_alter_table("workflow_definitions") as batch:
        for name in ("last_run_at", "next_run_at", "prompt"):
            batch.drop_column(name)
