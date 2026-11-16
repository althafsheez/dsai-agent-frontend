"""Restore the missing revision marker after the input-output branch was merged.

Some local SQLite databases already record this revision.  The branch switch
removed its source file, which made Alembic unable to advance those databases.
This bridge is deliberately schema-neutral: the following workspace migration
can now run safely for both existing and fresh databases.

Revision ID: 20261113_0006
Revises: 20261113_0005
"""
from collections.abc import Sequence


revision: str = "20261113_0006"
down_revision: str | None = "20261113_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
