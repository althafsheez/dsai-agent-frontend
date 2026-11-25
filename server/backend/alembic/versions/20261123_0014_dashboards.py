"""Add dashboards (shared, stored server-side).

Revision ID: 20261123_0014
Revises: 20261123_0013
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261123_0014"
down_revision: str | None = "20261123_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "dashboards" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "dashboards",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("owner_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("slicers", sa.JSON(), nullable=False),
        sa.Column("dataset_ids", sa.JSON(), nullable=False),
        sa.Column("widgets", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_dashboards_owner_id", "dashboards", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_dashboards_owner_id", table_name="dashboards")
    op.drop_table("dashboards")
