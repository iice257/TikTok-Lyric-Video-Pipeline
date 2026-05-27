"""initial platform schema

Revision ID: 0001_initial_platform_schema
Revises:
Create Date: 2026-05-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial_platform_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("csrf_token", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"])
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "worker_heartbeats",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("worker_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_loop", sa.String(length=64), nullable=True),
        sa.Column("current_job_id", sa.String(length=32), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("worker_name"),
    )
    op.create_index("ix_worker_heartbeats_worker_name", "worker_heartbeats", ["worker_name"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_id", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["acknowledged_by_id"], ["users.id"]),
    )

    op.create_table(
        "operator_actions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=32), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_operator_actions_action", "operator_actions", ["action"])

    op.create_table(
        "oauth_tokens",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("scopes_json", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_oauth_tokens_provider", "oauth_tokens", ["provider"])
    op.create_index("ix_oauth_tokens_subject", "oauth_tokens", ["subject"])

    op.create_table(
        "songs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("song_key", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("provider_name", sa.String(length=64), nullable=True),
        sa.Column("environment", sa.String(length=16), nullable=False),
        sa.Column("rights_status", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("review_status", sa.String(length=32), nullable=False),
        sa.Column("publish_eligible", sa.Boolean(), nullable=False),
        sa.Column("manual_priority", sa.Boolean(), nullable=False),
        sa.Column("ingest_fingerprint", sa.String(length=255), nullable=True),
        sa.Column("audio_path", sa.Text(), nullable=False),
        sa.Column("cover_path", sa.Text(), nullable=True),
        sa.Column("lyrics_path", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("audio_features_json", sa.JSON(), nullable=False),
        sa.Column("sections_json", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("song_key"),
    )
    op.create_index("ix_songs_ingest_fingerprint", "songs", ["ingest_fingerprint"])
    op.create_index("ix_songs_song_key", "songs", ["song_key"])
    op.create_index("ix_songs_status", "songs", ["status"])

    op.create_table(
        "song_inputs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("song_id", sa.String(length=32), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("provider_name", sa.String(length=64), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("raw_payload_json", sa.JSON(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
        sa.UniqueConstraint("song_id", "source_type", "file_path", name="uq_song_input"),
    )
    op.create_index("ix_song_inputs_song_id", "song_inputs", ["song_id"])

    op.create_table(
        "lyrics_artifacts",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("song_id", sa.String(length=32), nullable=False),
        sa.Column("source_format", sa.String(length=32), nullable=False),
        sa.Column("source_name", sa.String(length=64), nullable=False),
        sa.Column("source_ref", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("was_aligned", sa.Boolean(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("line_count", sa.Integer(), nullable=False),
        sa.Column("lines_json", sa.JSON(), nullable=False),
        sa.Column("raw_payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
    )
    op.create_index("ix_lyrics_artifacts_song_id", "lyrics_artifacts", ["song_id"])

    op.create_table(
        "segment_candidates",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("song_id", sa.String(length=32), nullable=False),
        sa.Column("start_second", sa.Float(), nullable=False),
        sa.Column("end_second", sa.Float(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("caption_seed", sa.Text(), nullable=False),
        sa.Column("repeated_phrase", sa.Text(), nullable=True),
        sa.Column("loudness_score", sa.Float(), nullable=False),
        sa.Column("repetition_score", sa.Float(), nullable=False),
        sa.Column("musicality_score", sa.Float(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
    )
    op.create_index("ix_segment_candidates_song_id", "segment_candidates", ["song_id"])

    op.create_table(
        "clips",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("song_id", sa.String(length=32), nullable=False),
        sa.Column("segment_candidate_id", sa.String(length=32), nullable=False),
        sa.Column("environment", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("review_required", sa.Boolean(), nullable=False),
        sa.Column("caption", sa.Text(), nullable=False),
        sa.Column("hook_category", sa.String(length=128), nullable=True),
        sa.Column("lyric_style", sa.String(length=64), nullable=False),
        sa.Column("layout_template", sa.String(length=128), nullable=False),
        sa.Column("font_family", sa.String(length=128), nullable=False),
        sa.Column("text_color", sa.String(length=64), nullable=False),
        sa.Column("highlight_color", sa.String(length=64), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("render_manifest_path", sa.Text(), nullable=True),
        sa.Column("subtitle_path", sa.Text(), nullable=True),
        sa.Column("video_path", sa.Text(), nullable=True),
        sa.Column("preview_path", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["segment_candidate_id"], ["segment_candidates.id"]),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"]),
    )
    op.create_index("ix_clips_segment_candidate_id", "clips", ["segment_candidate_id"])
    op.create_index("ix_clips_song_id", "clips", ["song_id"])
    op.create_index("ix_clips_status", "clips", ["status"])

    op.create_table(
        "render_jobs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("clip_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("claimed_by", sa.String(length=128), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ffmpeg_command_json", sa.JSON(), nullable=False),
        sa.Column("stderr_text", sa.Text(), nullable=True),
        sa.Column("artifact_metadata_json", sa.JSON(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["clip_id"], ["clips.id"]),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_render_jobs_clip_id", "render_jobs", ["clip_id"])
    op.create_index("ix_render_jobs_idempotency_key", "render_jobs", ["idempotency_key"])
    op.create_index("ix_render_jobs_status", "render_jobs", ["status"])

    op.create_table(
        "upload_jobs",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("clip_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("publish_mode", sa.String(length=32), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("claimed_by", sa.String(length=128), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("platform_post_id", sa.String(length=255), nullable=True),
        sa.Column("platform_response_json", sa.JSON(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_id", sa.String(length=32), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["clip_id"], ["clips.id"]),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_upload_jobs_clip_id", "upload_jobs", ["clip_id"])
    op.create_index("ix_upload_jobs_idempotency_key", "upload_jobs", ["idempotency_key"])
    op.create_index("ix_upload_jobs_scheduled_at", "upload_jobs", ["scheduled_at"])
    op.create_index("ix_upload_jobs_status", "upload_jobs", ["status"])

    op.create_table(
        "state_events",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("subject_type", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("from_state", sa.String(length=64), nullable=True),
        sa.Column("to_state", sa.String(length=64), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("actor_user_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
    )
    op.create_index("ix_state_events_subject_id", "state_events", ["subject_id"])
    op.create_index("ix_state_events_subject_type", "state_events", ["subject_type"])


def downgrade() -> None:
    for table_name in (
        "state_events",
        "upload_jobs",
        "render_jobs",
        "clips",
        "segment_candidates",
        "lyrics_artifacts",
        "song_inputs",
        "songs",
        "oauth_tokens",
        "operator_actions",
        "alerts",
        "worker_heartbeats",
        "app_settings",
        "sessions",
        "users",
    ):
        op.drop_table(table_name)
