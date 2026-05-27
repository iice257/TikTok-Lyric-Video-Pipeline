from __future__ import annotations

from datetime import timedelta
import json
from pathlib import Path
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
from tiktok_platform.services import create_alert, get_oauth_token_secrets, get_setting, record_state_event, upsert_oauth_token
from tiktok_platform.services import create_alert_once
from tiktok_platform.settings import PlatformSettings, get_settings
from tiktok_platform.tiktok_api import TikTokApiClient, TikTokApiError

from .adapters import build_pipeline_config, clip_to_style, lyrics_artifact_to_bundle, new_job_key, segment_candidate_to_selection, song_to_asset


class TikTokUploadAdapter:
    def __init__(self, settings: PlatformSettings) -> None:
        self.settings = settings
        self.client = TikTokApiClient(settings)

    def publish(self, db: Session, clip: Clip, upload_job: UploadJob) -> tuple[str, dict[str, object]]:
        if self.settings.simulate_uploads:
            return "posted", {"simulated": True, "platform_post_id": new_job_key("tiktok-post")}
        if not self.settings.tiktok_client_key or not self.settings.tiktok_client_secret or not self.settings.tiktok_redirect_uri:
            return "failed", {"error": "TikTok credentials are not configured."}

        token = get_oauth_token_secrets(db, self.settings, "tiktok")
        if token is None:
            return "failed", {"error": "No TikTok account is connected."}
        try:
            refreshed = self.client.ensure_fresh_token(token)
            if refreshed is not None:
                token = upsert_oauth_token(
                    db,
                    provider="tiktok",
                    subject=refreshed.subject,
                    access_token=refreshed.access_token,
                    refresh_token=refreshed.refresh_token,
                    scopes=refreshed.scopes,
                    expires_at=refreshed.expires_at,
                )

            access_token = token.access_token
            publish_id = str(upload_job.platform_post_id or (upload_job.platform_response_json or {}).get("publish_id") or "")
            if publish_id:
                status_payload = self.client.fetch_post_status(access_token, publish_id)
                return self._map_status(publish_id, status_payload)

            video_path = Path(clip.video_path or "")
            if not video_path.exists():
                return "failed", {"error": "Rendered video file is missing."}

            preferences = get_setting(
                db,
                "tiktok_preferences",
                {
                    "preferred_privacy_level": "SELF_ONLY",
                    "allow_comment": False,
                    "allow_duet": False,
                    "allow_stitch": False,
                },
            )
            pipeline_settings = get_setting(db, "pipeline", {"paused": False})
            upload_mode = str(pipeline_settings.get("upload_mode") or self.settings.upload_mode)
            publish_mode = self._resolve_publish_mode(
                token.scopes_json,
                upload_mode,
                clip.review_required,
                upload_job.publish_mode,
            )

            creator_info: dict[str, object] = {}
            if publish_mode == "direct":
                creator_info = self.client.query_creator_info(access_token)
                max_duration = creator_info.get("max_video_post_duration_sec")
                if max_duration is not None and clip.duration_seconds and clip.duration_seconds > float(max_duration):
                    return "failed", {
                        "error": f"Clip duration exceeds TikTok direct-post limit ({max_duration}s).",
                        "creator_info": creator_info,
                    }
                privacy_level = self._select_privacy_level(preferences, creator_info)
                init_payload = self.client.init_direct_post(
                    access_token=access_token,
                    file_path=video_path,
                    title=clip.caption[:150],
                    privacy_level=privacy_level,
                    disable_comment=not bool(preferences.get("allow_comment")),
                    disable_duet=not bool(preferences.get("allow_duet")),
                    disable_stitch=not bool(preferences.get("allow_stitch")),
                )
            else:
                init_payload = self.client.init_inbox_upload(
                    access_token=access_token,
                    file_path=video_path,
                )

            publish_id = str(init_payload["publish_id"])
            upload_url = str(init_payload.get("upload_url") or "")
            if upload_url:
                self.client.upload_file(upload_url, video_path)
            status_payload = self.client.fetch_post_status(access_token, publish_id)
            mapped_status, payload = self._map_status(publish_id, status_payload)
            payload["mode"] = publish_mode
            payload["init_payload"] = {key: value for key, value in init_payload.items() if key != "upload_url"}
            if creator_info:
                payload["creator_info"] = creator_info
            return mapped_status, payload
        except TikTokApiError as exc:
            return "failed", {"error": str(exc), "details": exc.payload}

    def _resolve_publish_mode(self, scopes: list[str], upload_mode: str, review_required: bool, job_publish_mode: str) -> str:
        if upload_mode == "draft":
            return "draft"
        if upload_mode == "direct":
            return "direct"
        if review_required or job_publish_mode == "review":
            return "draft"
        return "direct" if "video.publish" in scopes else "draft"

    @staticmethod
    def _select_privacy_level(preferences: dict[str, object], creator_info: dict[str, object]) -> str:
        requested = str(preferences.get("preferred_privacy_level") or "SELF_ONLY")
        options = creator_info.get("privacy_level_options") or []
        if requested in options:
            return requested
        if "SELF_ONLY" in options:
            return "SELF_ONLY"
        return str(options[0]) if options else "SELF_ONLY"

    @staticmethod
    def _map_status(publish_id: str, status_payload: dict[str, object]) -> tuple[str, dict[str, object]]:
        platform_status = str(status_payload.get("status") or "")
        public_post_ids = status_payload.get("publicaly_available_post_id") or status_payload.get("publicly_available_post_id") or []
        platform_post_id = str(public_post_ids[0]) if public_post_ids else None
        payload: dict[str, object] = {
            "publish_id": publish_id,
            "platform_status": platform_status,
            "platform_post_id": platform_post_id,
            "status_payload": status_payload,
        }
        if platform_status == "PUBLISH_COMPLETE":
            return "posted", payload
        if platform_status == "FAILED":
            payload["error"] = status_payload.get("fail_reason") or status_payload.get("reason") or "TikTok publish failed."
            return "failed", payload
        if platform_status == "SEND_TO_USER_INBOX":
            payload["next_poll_after_seconds"] = 300
            payload["requires_creator_action"] = True
            return "processing", payload
        if platform_status in {"PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD"}:
            payload["next_poll_after_seconds"] = 30
            return "processing", payload
        payload["next_poll_after_seconds"] = 60
        return "processing", payload


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

    def _recompute_song_status(self, db: Session, song: Song) -> None:
        clips = db.scalars(select(Clip).where(Clip.song_id == song.id)).all()
        if not clips:
            return
        clip_ids = [clip.id for clip in clips]
        upload_jobs = db.scalars(select(UploadJob).where(UploadJob.clip_id.in_(clip_ids))).all()

        active_render_states = {"queued_for_render"}
        active_upload_states = {"queued", "waiting_window", "claimed", "uploading", "processing"}

        if any(clip.status in active_render_states for clip in clips):
            song.status = "queued_for_render"
            return
        if any(job.status in active_upload_states for job in upload_jobs):
            song.status = "queued_for_upload"
            return
        if clips and all(clip.status == "posted" for clip in clips):
            song.status = "posted"
            return
        if any(clip.status == "failed" for clip in clips):
            song.status = "failed"

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
                    selected=rank <= self.config.segments.max_segments_per_song,
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
                .execution_options(synchronize_session=False)
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
                return db.get(RenderJob, job_id, populate_existing=True)
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
                scheduled_at = clip.scheduled_at or utcnow()
                next_status = "waiting_window" if scheduled_at > utcnow() else "queued"
                upload_job = db.scalar(
                    select(UploadJob)
                    .where(UploadJob.clip_id == clip.id)
                    .order_by(UploadJob.created_at.desc())
                )
                if upload_job is None:
                    upload_job = UploadJob(
                        clip_id=clip.id,
                        status=next_status,
                        publish_mode="review" if clip.review_required else "auto",
                        scheduled_at=scheduled_at,
                        idempotency_key=f"upload-{clip.id}-{job.id}",
                    )
                else:
                    upload_job.status = next_status
                    upload_job.publish_mode = "review" if clip.review_required else "auto"
                    upload_job.scheduled_at = scheduled_at
                    upload_job.completed_at = None
                    upload_job.last_error = None
                    upload_job.claimed_by = None
                    upload_job.claimed_at = None
                    upload_job.lease_expires_at = None
                db.add(upload_job)
            self._recompute_song_status(db, song)
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
                UploadJob.status.in_(["queued", "waiting_window", "processing"]),
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
                .execution_options(synchronize_session=False)
                .where(
                    UploadJob.id == job.id,
                    UploadJob.status.in_(["queued", "waiting_window", "processing"]),
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
                return db.get(UploadJob, job.id, populate_existing=True)
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
        status_text, payload = self.uploader.publish(db, clip, job)
        job.status = status_text
        job.platform_response_json = payload
        job.platform_post_id = payload.get("platform_post_id") or payload.get("publish_id")
        job.claimed_by = None
        job.claimed_at = None
        job.lease_expires_at = None
        if status_text == "processing":
            next_poll_after_seconds = int(payload.get("next_poll_after_seconds") or 60)
            job.completed_at = None
            job.last_error = None
            job.scheduled_at = utcnow() + timedelta(seconds=max(next_poll_after_seconds, 15))
            clip.last_error = None
            db.add_all([job, song, clip])
            record_state_event(
                db,
                subject_type="upload_job",
                subject_id=job.id,
                event_type="upload_processing",
                from_state="uploading",
                to_state=job.status,
                payload={"clip_id": clip.id, "song_id": song.id, "publish_id": payload.get("publish_id")},
            )
            db.commit()
            return
        else:
            job.completed_at = utcnow() if status_text in {"posted", "failed", "quarantined", "cancelled"} else None
        if status_text == "failed":
            job.last_error = str(payload.get("error", "Upload failed."))
            create_alert(db, kind="upload_failed", severity="error", message=job.last_error, source_type="upload_job", source_id=job.id)
        elif status_text == "posted":
            clip.status = "posted"
            clip.last_error = None
            job.last_error = None
        else:
            clip.last_error = None
        self._recompute_song_status(db, song)
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
