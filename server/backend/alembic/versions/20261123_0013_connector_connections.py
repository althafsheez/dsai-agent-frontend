"""Add OAuth connector connections (Google Drive).

Revision ID: 20261123_0013
Revises: 20261121_0012
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261123_0013"
down_revision: str | None = "20261121_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "connector_connections" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "connector_connections",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("account_email", sa.String(length=320)),
        sa.Column("scopes", sa.Text(), nullable=False, server_default=""),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text()),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "provider", name="uq_connector_user_provider"),
    )
    op.create_index("ix_connector_connections_user_id", "connector_connections", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_connector_connections_user_id", table_name="connector_connections")
    op.drop_table("connector_connections")
