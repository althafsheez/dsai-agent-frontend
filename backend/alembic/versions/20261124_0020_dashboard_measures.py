"""DAX measures saved on a dashboard: [{"name": str, "expression": str, "format": str}].

Revision ID: 20261124_0020
Revises: 20261124_0019
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261124_0020"
down_revision: str | None = "20261124_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "measures" not in {column["name"] for column in inspector.get_columns("dashboards")}:
        op.add_column("dashboards", sa.Column("measures", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))


def downgrade() -> None:
    op.drop_column("dashboards", "measures")
