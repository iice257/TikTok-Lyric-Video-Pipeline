from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db, utcnow
from tiktok_platform.models import Alert, Clip, RenderJob, Song, UploadJob, WorkerHeartbeat
from tiktok_platform.services import get_oauth_token, get_setting, serialize_alert, serialize_worker
from tiktok_platform.settings import PlatformSettings

from ..dependencies import get_current_user, get_platform_settings


router = APIRouter(tags=["dashboard"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard/summary")
def dashboard_summary(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: PlatformSettings = Depends(get_platform_settings),
) -> dict[str, object]:
    open_alerts = db.scalar(select(func.count(Alert.id)).where(Alert.status == "open")) or 0
    songs_total = db.scalar(select(func.count(Song.id))) or 0
    clips_total = db.scalar(select(func.count(Clip.id))) or 0
    render_backlog = db.scalar(select(func.count(RenderJob.id)).where(RenderJob.status.in_(["queued", "retry_wait"]))) or 0
    upload_backlog = db.scalar(select(func.count(UploadJob.id)).where(UploadJob.status.in_(["queued", "waiting_window"]))) or 0
    next_upload = db.scalar(
        select(func.min(UploadJob.scheduled_at)).where(UploadJob.status.in_(["queued", "waiting_window"]))
    )
    workers = db.scalars(select(WorkerHeartbeat).order_by(WorkerHeartbeat.worker_name.asc())).all()
    recent_alerts = db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(5)).all()
    pending_upload_jobs = db.scalars(
        select(UploadJob)
        .where(UploadJob.approved_at.is_(None))
        .order_by(UploadJob.scheduled_at.asc(), UploadJob.created_at.desc())
        .limit(3)
    ).all()
    pipeline_settings = get_setting(db, "pipeline", {"paused": False})
    clip_ids = [job.clip_id for job in pending_upload_jobs]
    clips = (
        db.scalars(select(Clip).where(Clip.id.in_(clip_ids))).all()
        if clip_ids
        else []
    )
    clip_map = {clip.id: clip for clip in clips}
    song_ids = [clip.song_id for clip in clips]
    songs = (
        db.scalars(select(Song).where(Song.id.in_(song_ids))).all()
        if song_ids
        else []
    )
    song_map = {song.id: song for song in songs}
    tiktok_token = get_oauth_token(db, "tiktok")
    creator_cache = get_setting(db, "tiktok_creator_info_cache", {})
    creator_info = creator_cache.get("data") if isinstance(creator_cache.get("data"), dict) else None
    return {
        "health": "degraded" if open_alerts else "healthy",
        "counts": {
            "songs": songs_total,
            "clips": clips_total,
            "render_backlog": render_backlog,
            "upload_backlog": upload_backlog,
            "open_alerts": open_alerts,
        },
        "pipeline": pipeline_settings,
        "next_publish_at": next_upload.isoformat() if next_upload else None,
        "workers": [serialize_worker(worker) for worker in workers],
        "recent_alerts": [serialize_alert(alert) for alert in recent_alerts],
        "pending_upload_jobs": [
            {
                "id": job.id,
                "status": job.status,
                "publish_mode": job.publish_mode,
                "scheduled_at": job.scheduled_at.isoformat() if job.scheduled_at else None,
                "clip_id": job.clip_id,
                "clip_caption": clip_map[job.clip_id].caption if job.clip_id in clip_map else None,
                "clip_preview_path": clip_map[job.clip_id].preview_path if job.clip_id in clip_map else None,
                "clip_video_path": clip_map[job.clip_id].video_path if job.clip_id in clip_map else None,
                "song_artist": song_map[clip_map[job.clip_id].song_id].artist
                if job.clip_id in clip_map and clip_map[job.clip_id].song_id in song_map
                else None,
                "song_title": song_map[clip_map[job.clip_id].song_id].title
                if job.clip_id in clip_map and clip_map[job.clip_id].song_id in song_map
                else None,
            }
            for job in pending_upload_jobs
        ],
        "integrations": {
            "tiktok": {
                "configured": bool(
                    settings.tiktok_client_key
                    and settings.tiktok_client_secret
                    and settings.tiktok_redirect_uri
                ),
                "connected": tiktok_token is not None,
                "subject": tiktok_token.subject if tiktok_token else None,
                "expires_at": tiktok_token.expires_at.isoformat()
                if tiktok_token and tiktok_token.expires_at
                else None,
                "last_error": creator_cache.get("last_error"),
                "creator_username": creator_info.get("creator_username") if creator_info else None,
                "creator_nickname": creator_info.get("creator_nickname") if creator_info else None,
            }
        },
    }


@router.get("/dashboard/health")
def dashboard_health(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    workers = db.scalars(select(WorkerHeartbeat).order_by(WorkerHeartbeat.worker_name.asc())).all()
    stale_workers = [
        worker for worker in workers if (utcnow() - worker.last_seen_at).total_seconds() > 180
    ]
    return {
        "status": "degraded" if stale_workers else "ok",
        "worker_count": len(workers),
        "stale_workers": [serialize_worker(worker) for worker in stale_workers],
        "workers": [serialize_worker(worker) for worker in workers],
    }
