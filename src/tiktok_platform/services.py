from __future__ import annotations

import hashlib
from pathlib import Path
import ipaddress
import mimetypes
import shutil

from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import ensure_utc, utcnow
from .models import (
    Alert,
    AppSetting,
    Clip,
    OperatorAction,
    RenderJob,
    SessionRecord,
    Song,
    StateEvent,
    UploadJob,
    User,
    WorkerHeartbeat,
)
from .security import default_session_ttl, hash_password, issue_session_token, session_token_hash, verify_password
from .settings import PlatformSettings


def ensure_admin_user(db: Session, settings: PlatformSettings) -> User:
    user = db.scalar(select(User).where(User.email == settings.admin_email))
    if user:
        return user
    password_hash = settings.admin_password_hash or hash_password("admin123")
    user = User(email=settings.admin_email, password_hash=password_hash, role="admin", status="active")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, settings: PlatformSettings, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email))
    if not user or user.status != "active":
        return None
    if not verify_password(password, user.password_hash):
        return None
    user.last_login_at = utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(db: Session, user: User, settings: PlatformSettings, request: Request) -> tuple[SessionRecord, str]:
    raw_token = issue_session_token()
    session = SessionRecord(
        user_id=user.id,
        token_hash=session_token_hash(raw_token, settings.session_secret),
        csrf_token=issue_session_token(),
        expires_at=utcnow() + default_session_ttl(),
        user_agent=request.headers.get("user-agent"),
        ip_address=get_client_ip(request),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, raw_token


def revoke_session(db: Session, session: SessionRecord) -> None:
    session.revoked_at = utcnow()
    db.add(session)
    db.commit()


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    candidate = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def require_authenticated_session(db: Session, settings: PlatformSettings, request: Request) -> tuple[User, SessionRecord]:
    token = request.cookies.get("platform_session")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    record = db.scalar(
        select(SessionRecord).where(
            SessionRecord.token_hash == session_token_hash(token, settings.session_secret),
        )
    )
    expires_at = ensure_utc(record.expires_at) if record else None
    revoked_at = ensure_utc(record.revoked_at) if record else None
    if not record or revoked_at is not None or (expires_at and expires_at <= utcnow()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")
    user = db.get(User, record.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive.")
    return user, record


def require_csrf(request: Request, session: SessionRecord) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    csrf_token = request.headers.get("x-csrf-token")
    if not csrf_token or csrf_token != session.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def get_setting(db: Session, key: str, default: dict[str, object]) -> dict[str, object]:
    record = db.get(AppSetting, key)
    if not record:
        return default
    return dict(record.value_json)


def set_setting(db: Session, key: str, value: dict[str, object]) -> AppSetting:
    record = db.get(AppSetting, key)
    if not record:
        record = AppSetting(key=key, value_json=value)
    else:
        record.value_json = value
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def record_state_event(
    db: Session,
    *,
    subject_type: str,
    subject_id: str,
    event_type: str,
    from_state: str | None,
    to_state: str | None,
    payload: dict[str, object] | None = None,
    actor_user_id: str | None = None,
) -> StateEvent:
    event = StateEvent(
        subject_type=subject_type,
        subject_id=subject_id,
        event_type=event_type,
        from_state=from_state,
        to_state=to_state,
        payload_json=payload or {},
        actor_user_id=actor_user_id,
    )
    db.add(event)
    db.flush()
    return event


def log_operator_action(
    db: Session,
    *,
    user_id: str | None,
    action: str,
    target_type: str,
    target_id: str | None,
    request: Request | None,
    details: dict[str, object] | None = None,
) -> OperatorAction:
    action_row = OperatorAction(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details_json=details or {},
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
    )
    db.add(action_row)
    db.flush()
    return action_row


def create_alert(
    db: Session,
    *,
    kind: str,
    severity: str,
    message: str,
    source_type: str | None = None,
    source_id: str | None = None,
    details: dict[str, object] | None = None,
) -> Alert:
    alert = Alert(
        kind=kind,
        severity=severity,
        message=message,
        source_type=source_type,
        source_id=source_id,
        details_json=details or {},
        status="open",
    )
    db.add(alert)
    db.flush()
    return alert


def create_alert_once(
    db: Session,
    *,
    kind: str,
    severity: str,
    message: str,
    source_type: str | None = None,
    source_id: str | None = None,
    details: dict[str, object] | None = None,
) -> Alert:
    existing = db.scalar(
        select(Alert).where(
            Alert.kind == kind,
            Alert.source_type == source_type,
            Alert.source_id == source_id,
            Alert.status == "open",
        )
    )
    if existing:
        existing.severity = severity
        existing.message = message
        existing.details_json = details or {}
        db.add(existing)
        db.flush()
        return existing
    return create_alert(
        db,
        kind=kind,
        severity=severity,
        message=message,
        source_type=source_type,
        source_id=source_id,
        details=details,
    )


def ensure_media_root(settings: PlatformSettings) -> Path:
    settings.media_root.mkdir(parents=True, exist_ok=True)
    for child in (
        settings.media_root / "manual-intake",
        settings.media_root / "render-manifests",
        settings.media_root / "videos",
        settings.media_root / "previews",
        settings.media_root / "lab",
    ):
        child.mkdir(parents=True, exist_ok=True)
    return settings.media_root


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_managed_path(settings: PlatformSettings, raw_path: str | None) -> Path:
    if not raw_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File path is missing.")
    candidate = Path(raw_path).expanduser().resolve(strict=False)
    allowed_roots = [
        ensure_media_root(settings),
        (get_repo_root() / "data").resolve(),
        (get_repo_root() / "output").resolve(),
    ]
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    if not any(candidate.is_relative_to(root) for root in allowed_roots):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="File is outside managed storage.")
    return candidate


def persist_upload_file(file: UploadFile, target: Path) -> dict[str, object]:
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    total_bytes = 0
    file.file.seek(0)
    with target.open("wb") as handle:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            total_bytes += len(chunk)
            handle.write(chunk)
    file.file.seek(0)
    return {"sha256": digest.hexdigest(), "size_bytes": total_bytes}


def guess_extension(filename: str, fallback: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix:
        return suffix
    guessed = mimetypes.guess_extension(mimetypes.guess_type(filename)[0] or "")
    return guessed or fallback


def serialize_song(song: Song) -> dict[str, object]:
    return {
        "id": song.id,
        "song_key": song.song_key,
        "title": song.title,
        "artist": song.artist,
        "source_type": song.source_type,
        "provider_name": song.provider_name,
        "environment": song.environment,
        "rights_status": song.rights_status,
        "status": song.status,
        "review_status": song.review_status,
        "publish_eligible": song.publish_eligible,
        "manual_priority": song.manual_priority,
        "audio_path": song.audio_path,
        "cover_path": song.cover_path,
        "lyrics_path": song.lyrics_path,
        "duration_seconds": song.duration_seconds,
        "metadata": song.metadata_json,
        "last_error": song.last_error,
        "created_at": song.created_at.isoformat(),
        "updated_at": song.updated_at.isoformat(),
    }


def serialize_clip(clip: Clip) -> dict[str, object]:
    return {
        "id": clip.id,
        "song_id": clip.song_id,
        "segment_candidate_id": clip.segment_candidate_id,
        "environment": clip.environment,
        "status": clip.status,
        "review_required": clip.review_required,
        "caption": clip.caption,
        "hook_category": clip.hook_category,
        "lyric_style": clip.lyric_style,
        "layout_template": clip.layout_template,
        "font_family": clip.font_family,
        "text_color": clip.text_color,
        "highlight_color": clip.highlight_color,
        "duration_seconds": clip.duration_seconds,
        "render_manifest_path": clip.render_manifest_path,
        "subtitle_path": clip.subtitle_path,
        "video_path": clip.video_path,
        "preview_path": clip.preview_path,
        "scheduled_at": clip.scheduled_at.isoformat() if clip.scheduled_at else None,
        "last_error": clip.last_error,
        "created_at": clip.created_at.isoformat(),
        "updated_at": clip.updated_at.isoformat(),
    }


def serialize_render_job(job: RenderJob) -> dict[str, object]:
    return {
        "id": job.id,
        "job_type": "render",
        "clip_id": job.clip_id,
        "status": job.status,
        "priority": job.priority,
        "attempt_count": job.attempt_count,
        "claimed_by": job.claimed_by,
        "claimed_at": job.claimed_at.isoformat() if job.claimed_at else None,
        "lease_expires_at": job.lease_expires_at.isoformat() if job.lease_expires_at else None,
        "ffmpeg_command": job.ffmpeg_command_json,
        "stderr_text": job.stderr_text,
        "artifact_metadata": job.artifact_metadata_json,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


def serialize_upload_job(job: UploadJob) -> dict[str, object]:
    return {
        "id": job.id,
        "job_type": "upload",
        "clip_id": job.clip_id,
        "status": job.status,
        "publish_mode": job.publish_mode,
        "scheduled_at": job.scheduled_at.isoformat(),
        "attempt_count": job.attempt_count,
        "claimed_by": job.claimed_by,
        "claimed_at": job.claimed_at.isoformat() if job.claimed_at else None,
        "lease_expires_at": job.lease_expires_at.isoformat() if job.lease_expires_at else None,
        "platform_post_id": job.platform_post_id,
        "platform_response": job.platform_response_json,
        "last_error": job.last_error,
        "approved_at": job.approved_at.isoformat() if job.approved_at else None,
        "approved_by_id": job.approved_by_id,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


def serialize_alert(alert: Alert) -> dict[str, object]:
    return {
        "id": alert.id,
        "kind": alert.kind,
        "severity": alert.severity,
        "message": alert.message,
        "source_type": alert.source_type,
        "source_id": alert.source_id,
        "status": alert.status,
        "details": alert.details_json,
        "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
        "acknowledged_by_id": alert.acknowledged_by_id,
        "created_at": alert.created_at.isoformat(),
        "updated_at": alert.updated_at.isoformat(),
    }


def serialize_worker(worker: WorkerHeartbeat) -> dict[str, object]:
    return {
        "id": worker.id,
        "worker_name": worker.worker_name,
        "status": worker.status,
        "current_loop": worker.current_loop,
        "current_job_id": worker.current_job_id,
        "metadata": worker.metadata_json,
        "last_seen_at": worker.last_seen_at.isoformat(),
    }


def serialize_operator_action(action: OperatorAction) -> dict[str, object]:
    return {
        "id": action.id,
        "user_id": action.user_id,
        "action": action.action,
        "target_type": action.target_type,
        "target_id": action.target_id,
        "details": action.details_json,
        "ip_address": action.ip_address,
        "user_agent": action.user_agent,
        "created_at": action.created_at.isoformat(),
    }


def serialize_state_event(event: StateEvent) -> dict[str, object]:
    return {
        "id": event.id,
        "subject_type": event.subject_type,
        "subject_id": event.subject_id,
        "event_type": event.event_type,
        "from_state": event.from_state,
        "to_state": event.to_state,
        "payload": event.payload_json,
        "actor_user_id": event.actor_user_id,
        "created_at": event.created_at.isoformat(),
    }
