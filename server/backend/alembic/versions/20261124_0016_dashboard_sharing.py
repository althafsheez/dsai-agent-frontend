"""Dashboard sharing (per-person roles) and automatic refresh interval.

Revision ID: 20261124_0016
Revises: 20261123_0015
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261124_0016"
down_revision: str | None = "20261123_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("dashboards")}


def upgrade() -> None:
    present = _columns()
    if "shares" not in present:
        op.add_column("dashboards", sa.Column("shares", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    if "refresh_minutes" not in present:
        op.add_column("dashboards", sa.Column("refresh_minutes", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("dashboards") as batch:
        batch.drop_column("refresh_minutes")
        batch.drop_column("shares")
