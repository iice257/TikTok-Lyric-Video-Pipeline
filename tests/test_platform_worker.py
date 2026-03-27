from __future__ import annotations

import importlib
from datetime import timedelta


def reload_platform_modules(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'platform.db').as_posix()}")
    monkeypatch.setenv("SESSION_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("TIKTOK_SIMULATE_UPLOADS", "true")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "storage"))

    import tiktok_platform.settings as settings_module
    import tiktok_platform.db as db_module
    import tiktok_platform.models as models_module
    import tiktok_platform.services as services_module
    import tiktok_platform_worker.engine as worker_engine_module

    settings_module.get_settings.cache_clear()
    for module in (
        settings_module,
        db_module,
        models_module,
        services_module,
        worker_engine_module,
    ):
        importlib.reload(module)
    return settings_module, db_module, models_module, worker_engine_module


def test_reconcile_requeues_expired_claimed_jobs(tmp_path, monkeypatch) -> None:
    _, db_module, models_module, worker_engine_module = reload_platform_modules(monkeypatch, tmp_path)
    db_module.init_db()

    with db_module.SessionLocal() as db:
        clip = models_module.Clip(
            song_id="song-1",
            segment_candidate_id="segment-1",
            caption="caption",
            lyric_style="karaoke_highlight",
            layout_template="album_centered",
            font_family="Sans",
            text_color="#fff",
            highlight_color="#ff0",
        )
        db.add(clip)
        db.flush()
        render_job = models_module.RenderJob(
            clip_id=clip.id,
            status="claimed",
            idempotency_key="render-1",
            claimed_by="worker-a",
            claimed_at=db_module.utcnow() - timedelta(minutes=20),
            lease_expires_at=db_module.utcnow() - timedelta(minutes=10),
        )
        upload_job = models_module.UploadJob(
            clip_id=clip.id,
            status="uploading",
            publish_mode="auto",
            scheduled_at=db_module.utcnow() - timedelta(minutes=5),
            idempotency_key="upload-1",
            claimed_by="worker-a",
            claimed_at=db_module.utcnow() - timedelta(minutes=20),
            lease_expires_at=db_module.utcnow() - timedelta(minutes=10),
        )
        db.add_all([render_job, upload_job])
        db.commit()

    worker = worker_engine_module.PlatformWorker(worker_name="test-worker")
    with db_module.SessionLocal() as db:
        worker.reconcile_jobs(db)
        render_job = db.get(models_module.RenderJob, render_job.id)
        upload_job = db.get(models_module.UploadJob, upload_job.id)
        assert render_job.status == "retry_wait"
        assert render_job.claimed_by is None
        assert upload_job.status == "queued"
        assert upload_job.claimed_by is None
