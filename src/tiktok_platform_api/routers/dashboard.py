from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tiktok_platform.db import get_db, utcnow
from tiktok_platform.models import Alert, Clip, RenderJob, Song, UploadJob, WorkerHeartbeat
from tiktok_platform.services import get_setting, serialize_alert, serialize_worker

from ..dependencies import get_current_user


router = APIRouter(tags=["dashboard"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard/summary")
def dashboard_summary(
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    pipeline_settings = get_setting(db, "pipeline", {"paused": False})
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
