"""Per-user dashboard pins and a stored listing preview.

Revision ID: 20261124_0017
Revises: 20261124_0016
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261124_0017"
down_revision: str | None = "20261124_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    present = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("dashboards")}
    if "pinned_by" not in present:
        op.add_column("dashboards", sa.Column("pinned_by", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    if "preview" not in present:
        op.add_column("dashboards", sa.Column("preview", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))


def downgrade() -> None:
    with op.batch_alter_table("dashboards") as batch:
        batch.drop_column("preview")
        batch.drop_column("pinned_by")
