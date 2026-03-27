from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, utcnow


def new_id() -> str:
    return uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(32), default="admin")
    status: Mapped[str] = mapped_column(String(32), default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    worker_name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="idle")
    current_loop: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_job_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    metadata_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    message: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open")
    details_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class OperatorAction(Base):
    __tablename__ = "operator_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128), index=True)
    target_type: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    details_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OAuthToken(TimestampMixin, Base):
    __tablename__ = "oauth_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(255), index=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    scopes_json: Mapped[list[str]] = mapped_column(default=list)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Song(TimestampMixin, Base):
    __tablename__ = "songs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    song_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    artist: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(64), default="manual")
    provider_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    environment: Mapped[str] = mapped_column(String(16), default="prod")
    rights_status: Mapped[str] = mapped_column(String(32), default="pending_review")
    status: Mapped[str] = mapped_column(String(32), default="ingested", index=True)
    review_status: Mapped[str] = mapped_column(String(32), default="pending")
    publish_eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    manual_priority: Mapped[bool] = mapped_column(Boolean, default=False)
    ingest_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    audio_path: Mapped[str] = mapped_column(Text)
    cover_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    lyrics_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    audio_features_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    sections_json: Mapped[list[dict[str, object]]] = mapped_column(default=list)
    metadata_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class SongInput(Base):
    __tablename__ = "song_inputs"
    __table_args__ = (UniqueConstraint("song_id", "source_type", "file_path", name="uq_song_input"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(64))
    provider_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LyricsArtifact(TimestampMixin, Base):
    __tablename__ = "lyrics_artifacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id"), index=True)
    source_format: Mapped[str] = mapped_column(String(32))
    source_name: Mapped[str] = mapped_column(String(64))
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready")
    was_aligned: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    lines_json: Mapped[list[dict[str, object]]] = mapped_column(default=list)
    raw_payload_json: Mapped[dict[str, object]] = mapped_column(default=dict)


class SegmentCandidate(TimestampMixin, Base):
    __tablename__ = "segment_candidates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id"), index=True)
    start_second: Mapped[float] = mapped_column(Float)
    end_second: Mapped[float] = mapped_column(Float)
    score: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text)
    caption_seed: Mapped[str] = mapped_column(Text)
    repeated_phrase: Mapped[str | None] = mapped_column(Text, nullable=True)
    loudness_score: Mapped[float] = mapped_column(Float, default=0.0)
    repetition_score: Mapped[float] = mapped_column(Float, default=0.0)
    musicality_score: Mapped[float] = mapped_column(Float, default=0.0)
    rank: Mapped[int] = mapped_column(Integer, default=0)
    selected: Mapped[bool] = mapped_column(Boolean, default=False)


class Clip(TimestampMixin, Base):
    __tablename__ = "clips"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id"), index=True)
    segment_candidate_id: Mapped[str] = mapped_column(ForeignKey("segment_candidates.id"), index=True)
    environment: Mapped[str] = mapped_column(String(16), default="prod")
    status: Mapped[str] = mapped_column(String(32), default="queued_for_render", index=True)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    caption: Mapped[str] = mapped_column(Text)
    hook_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lyric_style: Mapped[str] = mapped_column(String(64))
    layout_template: Mapped[str] = mapped_column(String(128))
    font_family: Mapped[str] = mapped_column(String(128))
    text_color: Mapped[str] = mapped_column(String(64))
    highlight_color: Mapped[str] = mapped_column(String(64))
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    render_manifest_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class RenderJob(TimestampMixin, Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    clip_id: Mapped[str] = mapped_column(ForeignKey("clips.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    claimed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ffmpeg_command_json: Mapped[list[str]] = mapped_column(default=list)
    stderr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_metadata_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UploadJob(TimestampMixin, Base):
    __tablename__ = "upload_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    clip_id: Mapped[str] = mapped_column(ForeignKey("clips.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    publish_mode: Mapped[str] = mapped_column(String(32), default="auto")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    claimed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    platform_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    platform_response_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StateEvent(Base):
    __tablename__ = "state_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    subject_type: Mapped[str] = mapped_column(String(64), index=True)
    subject_id: Mapped[str] = mapped_column(String(32), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    from_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[dict[str, object]] = mapped_column(default=dict)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
