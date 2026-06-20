from __future__ import annotations

import importlib
from datetime import timedelta
import json
from sqlalchemy import select
from tiktok_platform.token_crypto import generate_token_encryption_key


def reload_platform_modules(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("SESSION_SECRET", "test-secret")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", generate_token_encryption_key())
    monkeypatch.setenv("ADMIN_EMAIL", "admin99")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", "")
    monkeypatch.setenv("TIKTOK_SIMULATE_UPLOADS", "true")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "storage"))

    import tiktok_platform.settings as settings_module
    import tiktok_platform.db as db_module
    import tiktok_platform.models as models_module
    import tiktok_platform.services as services_module
    import tiktok_platform_worker.engine as worker_engine_module

    db_module.engine.dispose()
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


def test_recompute_song_status_requires_all_clips_posted(tmp_path, monkeypatch) -> None:
    _, db_module, models_module, worker_engine_module = reload_platform_modules(monkeypatch, tmp_path)
    db_module.init_db()

    with db_module.SessionLocal() as db:
        song = models_module.Song(
            song_key="song-aggregate",
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
            audio_path=str(tmp_path / "audio.mp3"),
        )
        db.add(song)
        db.flush()

        clip_posted = models_module.Clip(
            song_id=song.id,
            segment_candidate_id="segment-1",
            environment="prod",
            status="posted",
            review_required=False,
            caption="posted",
            lyric_style="karaoke_highlight",
            layout_template="album_centered",
            font_family="Sans",
            text_color="#fff",
            highlight_color="#ff0",
        )
        clip_pending = models_module.Clip(
            song_id=song.id,
            segment_candidate_id="segment-2",
            environment="prod",
            status="rendered",
            review_required=False,
            caption="pending",
            lyric_style="karaoke_highlight",
            layout_template="album_centered",
            font_family="Sans",
            text_color="#fff",
            highlight_color="#ff0",
        )
        db.add_all([clip_posted, clip_pending])
        db.flush()

        db.add(
            models_module.UploadJob(
                clip_id=clip_pending.id,
                status="processing",
                publish_mode="auto",
                scheduled_at=db_module.utcnow() + timedelta(seconds=10),
                idempotency_key="upload-processing",
            )
        )
        db.commit()

        worker = worker_engine_module.PlatformWorker(worker_name="test-worker")
        worker._recompute_song_status(db, song)
        db.add(song)
        db.commit()
        db.refresh(song)
        assert song.status == "queued_for_upload"


def test_process_render_jobs_reuses_existing_upload_job(tmp_path, monkeypatch) -> None:
    _, db_module, models_module, worker_engine_module = reload_platform_modules(monkeypatch, tmp_path)
    db_module.init_db()

    output_video = tmp_path / "clip.mp4"
    output_video.write_bytes(b"video-bytes")
    subtitle_path = tmp_path / "clip.ass"
    subtitle_path.write_text("ass", encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({"ffmpeg_stderr": None}), encoding="utf-8")

    with db_module.SessionLocal() as db:
        song = models_module.Song(
            song_key="song-rerender",
            title="Song",
            artist="Artist",
            source_type="manual",
            provider_name="manual-intake",
            environment="prod",
            rights_status="licensed",
            status="queued_for_render",
            review_status="pending",
            publish_eligible=True,
            manual_priority=True,
            audio_path=str(tmp_path / "audio.mp3"),
        )
        db.add(song)
        db.flush()

        segment = models_module.SegmentCandidate(
            song_id=song.id,
            start_second=0.0,
            end_second=35.0,
            score=0.9,
            reason="chorus",
            caption_seed="seed",
            rank=1,
            selected=True,
        )
        db.add(segment)
        db.flush()

        db.add(
            models_module.LyricsArtifact(
                song_id=song.id,
                source_format="lrc",
                source_name="manual",
                source_ref=None,
                status="ready",
                was_aligned=False,
                confidence=0.9,
                line_count=1,
                lines_json=[{"text": "line", "start": 0.0, "end": 3.0, "source_format": "lrc", "tokens": []}],
                raw_payload_json={},
            )
        )

        clip = models_module.Clip(
            song_id=song.id,
            segment_candidate_id=segment.id,
            environment="prod",
            status="queued_for_render",
            review_required=False,
            caption="caption",
            lyric_style="karaoke_highlight",
            layout_template="album_centered",
            font_family="Sans",
            text_color="#fff",
            highlight_color="#ff0",
        )
        db.add(clip)
        db.flush()

        db.add(
            models_module.UploadJob(
                clip_id=clip.id,
                status="failed",
                publish_mode="auto",
                scheduled_at=db_module.utcnow() - timedelta(minutes=1),
                idempotency_key="upload-existing",
                completed_at=db_module.utcnow() - timedelta(minutes=1),
                last_error="old failure",
            )
        )

        db.add(
            models_module.RenderJob(
                clip_id=clip.id,
                status="queued",
                priority=0,
                idempotency_key="render-rerender",
            )
        )
        db.commit()

    worker = worker_engine_module.PlatformWorker(worker_name="test-worker")

    class _FakePlan:
        def __init__(self, manifest):
            self.manifest_path = manifest

    class _FakeRendered:
        def __init__(self, output, subtitle, manifest):
            self.status = "rendered"
            self.output_path = output
            self.ass_path = subtitle
            self.manifest_path = manifest
            self.ffmpeg_command = ["ffmpeg", "-i", "x"]

    class _FakeSchedule:
        def __init__(self, scheduled_at):
            self.scheduled_at = scheduled_at

    worker.render_planner.plan_render = lambda *args, **kwargs: _FakePlan(manifest_path)
    worker.render_planner.write_render_artifacts = lambda plan: _FakeRendered(output_video, subtitle_path, plan.manifest_path)
    worker.renderer.render = lambda rendered: rendered
    worker.scheduler.schedule_jobs = lambda *args, **kwargs: [_FakeSchedule(db_module.utcnow() + timedelta(minutes=1))]

    with db_module.SessionLocal() as db:
        worker.process_render_jobs(db)
        song = db.scalar(select(models_module.Song).where(models_module.Song.song_key == "song-rerender"))
        clip = db.scalar(select(models_module.Clip).where(models_module.Clip.song_id == song.id))
        upload_jobs = db.scalars(select(models_module.UploadJob).where(models_module.UploadJob.clip_id == clip.id)).all()
        assert len(upload_jobs) == 1
        assert upload_jobs[0].idempotency_key == "upload-existing"
        assert upload_jobs[0].status in {"queued", "waiting_window"}
        assert upload_jobs[0].last_error is None
        assert song.status == "queued_for_upload"


def test_process_segments_uses_configured_max_segment_count(tmp_path, monkeypatch) -> None:
    _, db_module, models_module, worker_engine_module = reload_platform_modules(monkeypatch, tmp_path)
    db_module.init_db()

    with db_module.SessionLocal() as db:
        song = models_module.Song(
            song_key="song-segments",
            title="Song",
            artist="Artist",
            source_type="manual",
            provider_name="manual-intake",
            environment="prod",
            rights_status="licensed",
            status="lyrics_ready",
            review_status="pending",
            publish_eligible=True,
            manual_priority=True,
            audio_path=str(tmp_path / "audio.mp3"),
        )
        db.add(song)
        db.flush()
        db.add(
            models_module.LyricsArtifact(
                song_id=song.id,
                source_format="lrc",
                source_name="manual",
                source_ref=None,
                status="ready",
                was_aligned=False,
                confidence=0.9,
                line_count=1,
                lines_json=[{"text": "line", "start": 0.0, "end": 3.0, "source_format": "lrc", "tokens": []}],
                raw_payload_json={},
            )
        )
        db.commit()

    worker = worker_engine_module.PlatformWorker(worker_name="test-worker")

    class _Selection:
        def __init__(self, idx):
            self.start = float(idx * 10)
            self.end = self.start + 35.0
            self.score = 0.9
            self.reason = f"reason-{idx}"
            self.caption_seed = f"seed-{idx}"
            self.duration = 35.0

    class _Style:
        hook_category = "underrated songs"
        lyric_style = "karaoke_highlight"
        layout_template = "album_centered"
        font_family = "Sans"
        text_color = "#fff"
        highlight_color = "#ff0"

    worker.segmenter.select_segments = lambda *args, **kwargs: [_Selection(i) for i in range(1, 6)]
    worker.styling.decide = lambda *args, **kwargs: _Style()

    with db_module.SessionLocal() as db:
        worker.process_segments(db)
        song = db.scalar(select(models_module.Song).where(models_module.Song.song_key == "song-segments"))
        selected_candidates = db.scalars(
            select(models_module.SegmentCandidate).where(
                models_module.SegmentCandidate.song_id == song.id,
                models_module.SegmentCandidate.selected.is_(True),
            )
        ).all()
        clips = db.scalars(select(models_module.Clip).where(models_module.Clip.song_id == song.id)).all()
        assert len(selected_candidates) == 5
        assert len(clips) == 5
