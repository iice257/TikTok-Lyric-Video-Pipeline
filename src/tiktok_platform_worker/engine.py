from __future__ import annotations

from datetime import timedelta
import json
import time

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from tiktok_lyric_pipeline.stages.intake import SongIntakeService
from tiktok_lyric_pipeline.stages.lyrics import LyricsService
from tiktok_lyric_pipeline.stages.rendering import FFmpegRenderer, RenderPlanner
from tiktok_lyric_pipeline.stages.scheduling import SchedulePlanner
from tiktok_lyric_pipeline.stages.segments import SongSegmentSystem
from tiktok_lyric_pipeline.stages.styling import StyleDecisionEngine
from tiktok_platform.db import SessionLocal, ensure_utc, utcnow
from tiktok_platform.models import (
    Clip,
    LyricsArtifact,
    RenderJob,
    SegmentCandidate,
    Song,
    SongInput,
    UploadJob,
    WorkerHeartbeat,
)
from tiktok_platform.services import create_alert, get_setting, record_state_event
from tiktok_platform.services import create_alert_once
from tiktok_platform.settings import PlatformSettings, get_settings

from .adapters import build_pipeline_config, clip_to_style, lyrics_artifact_to_bundle, new_job_key, segment_candidate_to_selection, song_to_asset


class TikTokUploadAdapter:
    def __init__(self, settings: PlatformSettings) -> None:
        self.settings = settings

    def publish(self, clip: Clip, upload_job: UploadJob) -> tuple[str, dict[str, object]]:
        if self.settings.simulate_uploads:
            return "posted", {"simulated": True, "platform_post_id": new_job_key("tiktok-post")}
        if not self.settings.tiktok_client_key or not self.settings.tiktok_client_secret:
            return "failed", {"error": "TikTok credentials are not configured."}
        return "failed", {"error": "Real TikTok upload integration is not implemented in this scaffold."}


class PlatformWorker:
    def __init__(self, worker_name: str = "platform-worker") -> None:
        self.settings = get_settings()
        self.config = build_pipeline_config(self.settings.pipeline_config_path)
        self.worker_name = worker_name
        self.intake = SongIntakeService(self.config)
        self.lyrics = LyricsService(self.config)
        self.segmenter = SongSegmentSystem(self.config.segments)
        self.styling = StyleDecisionEngine(self.config.render, __import__("random").Random(self.config.random_seed))
        self.render_planner = RenderPlanner(self.config, seed=self.config.random_seed)
        self.renderer = FFmpegRenderer()
        self.scheduler = SchedulePlanner(self.config, seed=self.config.random_seed)
        self.uploader = TikTokUploadAdapter(self.settings)

    def _heartbeat(self, db: Session, status: str, loop_name: str | None = None, current_job_id: str | None = None) -> None:
        heartbeat = db.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_name == self.worker_name))
        if heartbeat is None:
            heartbeat = WorkerHeartbeat(worker_name=self.worker_name)
        heartbeat.status = status
        heartbeat.current_loop = loop_name
        heartbeat.current_job_id = current_job_id
        heartbeat.metadata_json = {"app_env": self.settings.app_env}
        heartbeat.last_seen_at = utcnow()
        db.add(heartbeat)
        db.commit()

    def run_forever(self, poll_interval_seconds: int = 30) -> None:
        while True:
            self.run_once()
            time.sleep(max(poll_interval_seconds, 5))

    def run_once(self) -> None:
        with SessionLocal() as db:
            self._heartbeat(db, "running", "sync")
            if get_setting(db, "pipeline", {"paused": False}).get("paused"):
                self._heartbeat(db, "paused", "sleep")
                return
            self.reconcile_jobs(db)
            self.sync_legacy_inputs(db)
            self.process_lyrics(db)
            self.process_segments(db)
            self.process_render_jobs(db)
            self.process_upload_jobs(db)
            self.monitor_health(db)
            self._heartbeat(db, "idle", "sleep")

    def reconcile_jobs(self, db: Session) -> None:
        now = utcnow()
        expired_render_jobs = db.scalars(
            select(RenderJob).where(
                RenderJob.status.in_(["claimed", "rendering"]),
                RenderJob.lease_expires_at.is_not(None),
                RenderJob.lease_expires_at < now,
            )
        ).all()
        for job in expired_render_jobs:
            previous = job.status
            job.status = "retry_wait"
            job.claimed_by = None
            job.claimed_at = None
            job.lease_expires_at = None
            job.stderr_text = (job.stderr_text or "") + "\nLease expired and job was re-queued."
            db.add(job)
            record_state_event(
                db,
                subject_type="render_job",
                subject_id=job.id,
                event_type="lease_expired",
                from_state=previous,
                to_state=job.status,
                payload={"worker_name": self.worker_name},
            )
        expired_upload_jobs = db.scalars(
            select(UploadJob).where(
                UploadJob.status.in_(["claimed", "uploading", "processing"]),
                UploadJob.lease_expires_at.is_not(None),
                UploadJob.lease_expires_at < now,
            )
        ).all()
        for job in expired_upload_jobs:
            previous = job.status
            scheduled_at = ensure_utc(job.scheduled_at) or now
            job.status = "waiting_window" if scheduled_at > now else "queued"
            job.claimed_by = None
            job.claimed_at = None
            job.lease_expires_at = None
            job.last_error = "Upload lease expired and job was re-queued."
            db.add(job)
            record_state_event(
                db,
                subject_type="upload_job",
                subject_id=job.id,
                event_type="lease_expired",
                from_state=previous,
                to_state=job.status,
                payload={"worker_name": self.worker_name},
            )
        db.commit()

    def monitor_health(self, db: Session) -> None:
        now = utcnow()
        stale_workers = db.scalars(select(WorkerHeartbeat)).all()
        for worker in stale_workers:
            last_seen_at = ensure_utc(worker.last_seen_at) or now
            age_seconds = (now - last_seen_at).total_seconds()
            if age_seconds > 180:
                create_alert_once(
                    db,
                    kind="worker_stalled",
                    severity="warning",
                    message=f"Worker {worker.worker_name} has not heartbeated for {int(age_seconds)} seconds.",
                    source_type="worker",
                    source_id=worker.id,
                    details={"worker_name": worker.worker_name, "last_seen_at": last_seen_at.isoformat()},
                )
        db.commit()

    def sync_legacy_inputs(self, db: Session) -> None:
        batch = self.intake.pull_batch()
        for song_asset in batch.ordered_songs:
            song = db.scalar(select(Song).where(Song.song_key == song_asset.song_id))
            rights_status = "licensed" if song_asset.manual_priority else "metadata_only"
            publish_eligible = song_asset.manual_priority and rights_status == "licensed"
            if song is None:
                song = Song(
                    song_key=song_asset.song_id,
                    title=song_asset.title,
                    artist=song_asset.artist,
                    source_type="manual" if song_asset.manual_priority else "automated",
                    provider_name=song_asset.source,
                    environment="prod",
                    rights_status=rights_status,
                    status="ingested",
                    review_status="pending",
                    publish_eligible=publish_eligible,
                    manual_priority=song_asset.manual_priority,
                    ingest_fingerprint=str(song_asset.metadata.get("manual_fingerprint", song_asset.song_id)),
                    audio_path=str(song_asset.audio_path),
                    cover_path=str(song_asset.album_cover_path) if song_asset.album_cover_path else None,
                    lyrics_path=str(song_asset.lyrics_path) if song_asset.lyrics_path else None,
                    duration_seconds=song_asset.duration_seconds,
                    audio_features_json=song_asset.audio_features,
                    sections_json=[
                        {
                            "start": section.start,
                            "duration": section.duration,
                            "loudness": section.loudness,
                            "tempo": section.tempo,
                            "danceability": section.danceability,
                            "energy": section.energy,
                            "confidence": section.confidence,
                        }
                        for section in song_asset.sections
                    ],
                    metadata_json=song_asset.metadata,
                )
                db.add(song)
                db.flush()
                db.add(
                    SongInput(
                        song_id=song.id,
                        source_type=song.source_type,
                        provider_name=song.provider_name,
                        file_path=song.audio_path,
                        raw_payload_json=song.metadata_json,
                    )
                )
                record_state_event(
                    db,
                    subject_type="song",
                    subject_id=song.id,
                    event_type="synced_from_legacy",
                    from_state=None,
                    to_state=song.status,
                    payload={"source_type": song.source_type},
                )
        db.commit()

    def process_lyrics(self, db: Session) -> None:
        songs = db.scalars(select(Song).where(Song.status.in_(["ingested", "awaiting_lyrics"])).order_by(Song.created_at.asc()).limit(5)).all()
        for song in songs:
            self._heartbeat(db, "running", "lyrics", song.id)
            try:
                bundle = self.lyrics.resolve_lyrics(song_to_asset(song))
                artifact = LyricsArtifact(
                    song_id=song.id,
                    source_format=bundle.lines[0].source_format if bundle.lines else "unknown",
                    source_name=bundle.source_name,
                    source_ref=song.lyrics_path,
                    status="ready",
                    was_aligned=bundle.was_aligned,
                    confidence=0.55 if bundle.was_aligned else 0.85,
                    line_count=len(bundle.lines),
                    lines_json=[
                        {
                            "text": line.text,
                            "start": line.start,
                            "end": line.end,
                            "source_format": line.source_format,
                            "tokens": [{"text": token.text, "start": token.start, "end": token.end} for token in line.tokens],
                        }
                        for line in bundle.lines
                    ],
                    raw_payload_json=bundle.raw_payload,
                )
                old_status = song.status
                song.status = "lyrics_ready"
                song.last_error = None
                db.add(artifact)
                db.add(song)
                record_state_event(db, subject_type="song", subject_id=song.id, event_type="lyrics_resolved", from_state=old_status, to_state=song.status, payload={"line_count": artifact.line_count})
            except FileNotFoundError as exc:
                old_status = song.status
                song.status = "failed"
                song.last_error = str(exc)
                db.add(song)
                create_alert(db, kind="lyrics_missing", severity="warning", message=str(exc), source_type="song", source_id=song.id)
                record_state_event(db, subject_type="song", subject_id=song.id, event_type="lyrics_failed", from_state=old_status, to_state=song.status, payload={"error": str(exc)})
            db.commit()

    def process_segments(self, db: Session) -> None:
        songs = db.scalars(select(Song).where(Song.status == "lyrics_ready").order_by(Song.updated_at.asc()).limit(5)).all()
        for song in songs:
            self._heartbeat(db, "running", "segments", song.id)
            artifact = db.scalar(select(LyricsArtifact).where(LyricsArtifact.song_id == song.id).order_by(LyricsArtifact.created_at.desc()))
            if artifact is None:
                continue
            bundle = lyrics_artifact_to_bundle(artifact)
            selections = self.segmenter.select_segments(song_to_asset(song), bundle.lines)
            if not selections:
                old_status = song.status
                song.status = "failed"
                song.last_error = "No segment candidates were selected."
                create_alert(db, kind="segment_failed", severity="warning", message=song.last_error, source_type="song", source_id=song.id)
                record_state_event(db, subject_type="song", subject_id=song.id, event_type="segment_failed", from_state=old_status, to_state=song.status, payload={"error": song.last_error})
                db.add(song)
                db.commit()
                continue
            old_status = song.status
            for rank, selection in enumerate(selections, start=1):
                existing = db.scalar(
                    select(SegmentCandidate).where(
                        SegmentCandidate.song_id == song.id,
                        SegmentCandidate.start_second == selection.start,
                        SegmentCandidate.end_second == selection.end,
                    )
                )
                if existing:
                    continue
                candidate = SegmentCandidate(
                    song_id=song.id,
                    start_second=selection.start,
                    end_second=selection.end,
                    score=selection.score,
                    reason=selection.reason,
                    caption_seed=selection.caption_seed,
                    repeated_phrase=selection.caption_seed,
                    rank=rank,
                    selected=rank <= 3,
                )
                db.add(candidate)
                db.flush()
                if candidate.selected:
                    style = self.styling.decide(song_to_asset(song))
                    review_required = artifact.confidence < 0.7 or candidate.score < 0.55
                    clip = Clip(
                        song_id=song.id,
                        segment_candidate_id=candidate.id,
                        environment=song.environment,
                        status="queued_for_render",
                        review_required=review_required,
                        caption=f"[{style.hook_category or 'underrated songs'}] {selection.caption_seed} | {song.artist} - {song.title}",
                        hook_category=style.hook_category,
                        lyric_style=style.lyric_style,
                        layout_template=style.layout_template,
                        font_family=style.font_family,
                        text_color=style.text_color,
                        highlight_color=style.highlight_color,
                        duration_seconds=selection.duration,
                    )
                    db.add(clip)
                    db.flush()
                    db.add(
                        RenderJob(
                            clip_id=clip.id,
                            status="queued",
                            priority=0 if song.manual_priority else 100,
                            idempotency_key=f"render-{clip.id}",
                        )
                    )
            song.status = "queued_for_render"
            song.last_error = None
            db.add(song)
            record_state_event(db, subject_type="song", subject_id=song.id, event_type="segments_selected", from_state=old_status, to_state=song.status, payload={"candidate_count": len(selections)})
            db.commit()

    def _claim_render_job(self, db: Session) -> RenderJob | None:
        now = utcnow()
        candidates = db.scalars(
            select(RenderJob.id)
            .where(
                RenderJob.status.in_(["queued", "retry_wait"]),
                or_(RenderJob.lease_expires_at.is_(None), RenderJob.lease_expires_at < now),
            )
            .order_by(RenderJob.priority.asc(), RenderJob.created_at.asc())
            .limit(25)
        ).all()
        for job_id in candidates:
            result = db.execute(
                update(RenderJob)
                .where(
                    RenderJob.id == job_id,
                    RenderJob.status.in_(["queued", "retry_wait"]),
                    or_(RenderJob.lease_expires_at.is_(None), RenderJob.lease_expires_at < now),
                )
                .values(
                    status="claimed",
                    attempt_count=RenderJob.attempt_count + 1,
                    claimed_by=self.worker_name,
                    claimed_at=now,
                    lease_expires_at=now + timedelta(minutes=10),
                )
            )
            if result.rowcount:
                db.commit()
                return db.get(RenderJob, job_id)
            db.rollback()
        return None

    def process_render_jobs(self, db: Session) -> None:
        job = self._claim_render_job(db)
        if job is None:
            return
        self._heartbeat(db, "running", "render", job.id)
        previous_status = job.status
        job.status = "rendering"
        db.add(job)
        record_state_event(
            db,
            subject_type="render_job",
            subject_id=job.id,
            event_type="render_started",
            from_state=previous_status,
            to_state=job.status,
            payload={"worker_name": self.worker_name},
        )
        db.commit()
        clip = db.get(Clip, job.clip_id)
        if clip is None:
            job.status = "failed"
            job.stderr_text = "Clip not found."
            db.add(job)
            db.commit()
            return
        song = db.get(Song, clip.song_id)
        segment = db.get(SegmentCandidate, clip.segment_candidate_id)
        artifact = db.scalar(select(LyricsArtifact).where(LyricsArtifact.song_id == song.id).order_by(LyricsArtifact.created_at.desc())) if song else None
        if song is None or segment is None or artifact is None:
            job.status = "failed"
            job.stderr_text = "Missing dependent records for render."
            clip.status = "failed"
            clip.last_error = job.stderr_text
            if song is not None:
                song.status = "failed"
                song.last_error = job.stderr_text
                db.add(song)
            db.add_all([job, clip])
            db.commit()
            return
        try:
            bundle = lyrics_artifact_to_bundle(artifact)
            plan = self.render_planner.plan_render(
                song_to_asset(song),
                segment_candidate_to_selection(segment, song.song_key),
                bundle,
                style_override=clip_to_style(clip),
            )
            rendered = self.render_planner.write_render_artifacts(plan)
            rendered = self.renderer.render(rendered)
            job.status = "rendered" if rendered.status == "rendered" else "failed"
            job.ffmpeg_command_json = rendered.ffmpeg_command
            manifest_text = plan.manifest_path.read_text(encoding="utf-8") if plan.manifest_path.exists() else "{}"
            job.artifact_metadata_json = json.loads(manifest_text)
            job.stderr_text = job.artifact_metadata_json.get("ffmpeg_stderr")
            job.completed_at = utcnow()
            clip.status = "rendered" if rendered.status == "rendered" else "failed"
            clip.last_error = None if rendered.status == "rendered" else clip.last_error
            clip.render_manifest_path = str(rendered.manifest_path)
            clip.subtitle_path = str(rendered.ass_path)
            clip.video_path = str(rendered.output_path)
            clip.scheduled_at = self.scheduler.schedule_jobs(
                [clip.id],
                [rendered.output_path],
                [clip.caption],
                [clip.hook_category],
                now=utcnow(),
            )[0].scheduled_at
            if rendered.status != "rendered":
                clip.last_error = job.stderr_text or "Render failed."
                create_alert(db, kind="render_failed", severity="error", message=clip.last_error, source_type="clip", source_id=clip.id)
            else:
                upload_job = UploadJob(
                    clip_id=clip.id,
                    status="waiting_window" if (clip.scheduled_at or utcnow()) > utcnow() else "queued",
                    publish_mode="review" if clip.review_required else "auto",
                    scheduled_at=clip.scheduled_at or utcnow(),
                    idempotency_key=f"upload-{clip.id}",
                )
                db.add(upload_job)
                song.status = "queued_for_upload"
            if rendered.status != "rendered":
                song.status = "failed"
            db.add_all([job, clip, song])
            record_state_event(
                db,
                subject_type="render_job",
                subject_id=job.id,
                event_type="render_finished",
                from_state="rendering",
                to_state=job.status,
                payload={"clip_id": clip.id, "song_id": song.id},
            )
            db.commit()
        except Exception as exc:
            job.status = "failed"
            job.stderr_text = str(exc)
            clip.status = "failed"
            clip.last_error = str(exc)
            song.last_error = str(exc)
            create_alert(db, kind="render_exception", severity="error", message=str(exc), source_type="clip", source_id=clip.id)
            db.add_all([job, clip, song])
            record_state_event(
                db,
                subject_type="render_job",
                subject_id=job.id,
                event_type="render_exception",
                from_state="rendering",
                to_state=job.status,
                payload={"error": str(exc)},
            )
            db.commit()

    def _claim_upload_job(self, db: Session) -> UploadJob | None:
        now = utcnow()
        jobs = db.scalars(
            select(UploadJob)
            .where(
                UploadJob.status.in_(["queued", "waiting_window"]),
                UploadJob.scheduled_at <= now,
                or_(UploadJob.lease_expires_at.is_(None), UploadJob.lease_expires_at < now),
            )
            .order_by(UploadJob.scheduled_at.asc())
        ).all()
        for job in jobs:
            clip = db.get(Clip, job.clip_id)
            if clip and clip.review_required and job.approved_at is None:
                continue
            result = db.execute(
                update(UploadJob)
                .where(
                    UploadJob.id == job.id,
                    UploadJob.status.in_(["queued", "waiting_window"]),
                    UploadJob.scheduled_at <= now,
                    or_(UploadJob.lease_expires_at.is_(None), UploadJob.lease_expires_at < now),
                )
                .values(
                    status="claimed",
                    attempt_count=UploadJob.attempt_count + 1,
                    claimed_by=self.worker_name,
                    claimed_at=now,
                    lease_expires_at=now + timedelta(minutes=5),
                )
            )
            if result.rowcount:
                db.commit()
                return db.get(UploadJob, job.id)
            db.rollback()
        return None

    def process_upload_jobs(self, db: Session) -> None:
        job = self._claim_upload_job(db)
        if job is None:
            return
        self._heartbeat(db, "running", "upload", job.id)
        previous_status = job.status
        job.status = "uploading"
        db.add(job)
        record_state_event(
            db,
            subject_type="upload_job",
            subject_id=job.id,
            event_type="upload_started",
            from_state=previous_status,
            to_state=job.status,
            payload={"worker_name": self.worker_name},
        )
        db.commit()
        clip = db.get(Clip, job.clip_id)
        song = db.get(Song, clip.song_id) if clip else None
        if clip is None or song is None:
            job.status = "failed"
            job.last_error = "Clip or song not found."
            db.add(job)
            db.commit()
            return
        if song.environment != "prod" or not song.publish_eligible:
            job.status = "quarantined"
            job.last_error = "Song is not publish-eligible for production."
            create_alert(db, kind="publish_blocked", severity="warning", message=job.last_error, source_type="upload_job", source_id=job.id)
            db.add(job)
            db.commit()
            return
        status_text, payload = self.uploader.publish(clip, job)
        job.status = status_text
        job.platform_response_json = payload
        job.platform_post_id = payload.get("platform_post_id")
        job.completed_at = utcnow() if status_text in {"posted", "failed"} else None
        if status_text != "posted":
            job.last_error = str(payload.get("error", "Upload failed."))
            create_alert(db, kind="upload_failed", severity="error", message=job.last_error, source_type="upload_job", source_id=job.id)
            song.status = "failed"
        else:
            song.status = "posted"
            clip.status = "posted"
            clip.last_error = None
        db.add_all([job, song, clip])
        record_state_event(
            db,
            subject_type="upload_job",
            subject_id=job.id,
            event_type="upload_finished",
            from_state="uploading",
            to_state=job.status,
            payload={"clip_id": clip.id, "song_id": song.id},
        )
        db.commit()
