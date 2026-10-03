"""render presets

Revision ID: 0003_render_presets
Revises: 0002_postgres_search_indexes
Create Date: 2026-10-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_render_presets"
down_revision = "0002_postgres_search_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("songs", sa.Column("preset_id", sa.String(length=64), nullable=True))
    op.add_column("clips", sa.Column("preset_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("clips", "preset_id")
    op.drop_column("songs", "preset_id")
