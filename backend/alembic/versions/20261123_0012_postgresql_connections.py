"""Persist PostgreSQL connections and per-message selections."""
from alembic import op
import sqlalchemy as sa

revision = "20261123_0012"
down_revision = "20261120_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("data_connections"):
        op.create_table(
            "data_connections",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("provider", sa.String(24), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("created_by", sa.String(64), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id")),
            sa.Column("encrypted_credentials", sa.Text(), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("include_schema_for_ai", sa.Boolean(), nullable=False),
            sa.Column("enable_previews", sa.Boolean(), nullable=False),
            sa.Column("schema_filter", sa.JSON(), nullable=False),
            sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_data_connections_created_by", "data_connections", ["created_by"])
        op.create_index("ix_data_connections_workspace_id", "data_connections", ["workspace_id"])
    if "connection_ids" not in {column["name"] for column in inspector.get_columns("messages")}:
        op.add_column("messages", sa.Column("connection_ids", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("connection_ids")
    op.drop_table("data_connections")
