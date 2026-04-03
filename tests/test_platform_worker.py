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


def test_upload_job_processing_requeues_poll_without_duplicate_publish(tmp_path, monkeypatch) -> None:
    _, db_module, models_module, worker_engine_module = reload_platform_modules(monkeypatch, tmp_path)
    db_module.init_db()

    video_path = tmp_path / "clip.mp4"
    video_path.write_bytes(b"video-bytes")

    with db_module.SessionLocal() as db:
        song = models_module.Song(
            song_key="song-1",
            title="Song",
            artist="Artist",
            source_type="manual",
            provider_name="manual-intake",
            environment="prod",
            rights_status="licensed",
            status="queued_for_upload",
            review_status="pending",
            publish_eligible=True,
            manual_priority=True,
            audio_path=str(video_path),
        )
        db.add(song)
        db.flush()
        clip = models_module.Clip(
            song_id=song.id,
            segment_candidate_id="segment-1",
            environment="prod",
            status="rendered",
            review_required=False,
            caption="caption",
            lyric_style="karaoke_highlight",
            layout_template="album_centered",
            font_family="Sans",
            text_color="#fff",
            highlight_color="#ff0",
            video_path=str(video_path),
        )
        db.add(clip)
        db.flush()
        upload_job = models_module.UploadJob(
            clip_id=clip.id,
            status="queued",
            publish_mode="auto",
            scheduled_at=db_module.utcnow() - timedelta(minutes=1),
            idempotency_key="upload-clip-1",
        )
        db.add(upload_job)
        db.commit()

    worker = worker_engine_module.PlatformWorker(worker_name="test-worker")

    class FakeUploader:
        def __init__(self) -> None:
            self.calls = 0

        def publish(self, db, clip, upload_job):
            self.calls += 1
            if self.calls == 1:
                return "processing", {
                    "publish_id": "publish-1",
                    "platform_post_id": "publish-1",
                    "next_poll_after_seconds": 30,
                }
            return "posted", {
                "publish_id": "publish-1",
                "platform_post_id": "post-1",
            }

    worker.uploader = FakeUploader()

    with db_module.SessionLocal() as db:
        worker.process_upload_jobs(db)
        db.expire_all()
        upload_job = db.get(models_module.UploadJob, upload_job.id)
        song = db.get(models_module.Song, song.id)
        clip = db.get(models_module.Clip, clip.id)
        assert upload_job.status == "processing"
        assert upload_job.platform_post_id == "publish-1"
        assert upload_job.completed_at is None
        assert upload_job.claimed_by is None
        assert db_module.ensure_utc(upload_job.scheduled_at) > db_module.utcnow()
        assert song.status == "queued_for_upload"
        assert clip.status == "rendered"

        upload_job.scheduled_at = db_module.utcnow() - timedelta(seconds=1)
        db.add(upload_job)
        db.commit()

        worker.process_upload_jobs(db)
        db.expire_all()
        upload_job = db.get(models_module.UploadJob, upload_job.id)
        song = db.get(models_module.Song, song.id)
        clip = db.get(models_module.Clip, clip.id)
        assert upload_job.status == "posted"
        assert upload_job.platform_post_id == "post-1"
        assert upload_job.completed_at is not None
        assert song.status == "posted"
        assert clip.status == "posted"
