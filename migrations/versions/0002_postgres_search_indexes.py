"""postgres search indexes

Revision ID: 0002_postgres_search_indexes
Revises: 0001_initial_platform_schema
Create Date: 2026-05-27
"""

from __future__ import annotations

from alembic import op


revision = "0002_postgres_search_indexes"
down_revision = "0001_initial_platform_schema"
branch_labels = None
depends_on = None


SONG_SEARCH_INDEX = "ix_songs_search_document"
CLIP_SEARCH_INDEX = "ix_clips_search_document"


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        f"""
        create index if not exists {SONG_SEARCH_INDEX}
        on songs using gin (
            to_tsvector(
                'simple',
                concat_ws(' ', title, artist, status, rights_status, review_status)
            )
        )
        """
    )
    op.execute(
        f"""
        create index if not exists {CLIP_SEARCH_INDEX}
        on clips using gin (
            to_tsvector(
                'simple',
                concat_ws(' ', caption, hook_category, status)
            )
        )
        """
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(f"drop index if exists {CLIP_SEARCH_INDEX}")
    op.execute(f"drop index if exists {SONG_SEARCH_INDEX}")
