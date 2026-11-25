"""Persist input/output resource source and generic Library references.

Revision ID: 20261113_0004
Revises: 20261112_0003
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261113_0004"
down_revision: str | None = "20261112_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    resource_columns = {column["name"] for column in inspector.get_columns("resources")}
    if "source" not in resource_columns:
        op.add_column("resources", sa.Column("source", sa.String(length=16), nullable=True))
        op.execute("UPDATE resources SET source = CASE WHEN origin = 'generated' THEN 'output' ELSE 'input' END")
        with op.batch_alter_table("resources") as batch:
            batch.alter_column("source", nullable=False, server_default="input")

    if not inspector.has_table("library_entries"):
        op.create_table(
            "library_entries",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("resource_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["resource_id"], ["resources.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "resource_id", name="uq_library_entry_resource"),
        )
        op.create_index(op.f("ix_library_entries_user_id"), "library_entries", ["user_id"], unique=False)
        op.create_index(op.f("ix_library_entries_resource_id"), "library_entries", ["resource_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("library_entries"):
        op.drop_index(op.f("ix_library_entries_resource_id"), table_name="library_entries")
        op.drop_index(op.f("ix_library_entries_user_id"), table_name="library_entries")
        op.drop_table("library_entries")
    if "source" in {column["name"] for column in inspector.get_columns("resources")}:
        with op.batch_alter_table("resources") as batch:
            batch.drop_column("source")
