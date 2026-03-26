from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import random

from .config import PipelineConfig
from .models import SongAsset
from .stages import FFmpegRenderer, QueueExporter, RenderPlanner, SchedulePlanner
from .stages.intake import SongIntakeService
from .stages.lyrics import LyricsService
from .stages.segments import SongSegmentSystem
from .stages.styling import StyleDecisionEngine
from .utils import ensure_directory, read_json, write_json


@dataclass(slots=True)
class ClipOutcome:
    clip_id: str
    song_id: str
    title: str
    artist: str
    status: str
    output_path: str
    scheduled_at: str | None = None
    hook_category: str | None = None


@dataclass(slots=True)
class SongOutcome:
    song_id: str
    title: str
    artist: str
    source: str
    status: str
    message: str
    clips: list[ClipOutcome] = field(default_factory=list)


@dataclass(slots=True)
class PipelineRunResult:
    target_clip_count: int
    produced_clip_count: int
    queue_path: Path | None
    queue_ndjson_path: Path | None
    songs: list[SongOutcome]
    rendered: int
    planned_only: int
    failed: int

    def to_dict(self) -> dict[str, object]:
        return {
            "target_clip_count": self.target_clip_count,
            "produced_clip_count": self.produced_clip_count,
            "queue_path": str(self.queue_path) if self.queue_path else None,
            "queue_ndjson_path": str(self.queue_ndjson_path) if self.queue_ndjson_path else None,
            "rendered": self.rendered,
            "planned_only": self.planned_only,
            "failed": self.failed,
            "songs": [
                {
                    "song_id": item.song_id,
                    "title": item.title,
                    "artist": item.artist,
                    "source": item.source,
                    "status": item.status,
                    "message": item.message,
                    "clips": [
                        {
                            "clip_id": clip.clip_id,
                            "song_id": clip.song_id,
                            "title": clip.title,
                            "artist": clip.artist,
                            "status": clip.status,
                            "output_path": clip.output_path,
                            "scheduled_at": clip.scheduled_at,
                            "hook_category": clip.hook_category,
                        }
                        for clip in item.clips
                    ],
                }
                for item in self.songs
            ],
        }


class TikTokLyricPipeline:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self.rng = random.Random(config.random_seed)
        self.intake = SongIntakeService(config)
        self.lyrics = LyricsService(config)
        self.segmenter = SongSegmentSystem(config.segments)
        self.styling = StyleDecisionEngine(config.render, self.rng)
        self.render_planner = RenderPlanner(config, seed=config.random_seed)
        self.renderer = FFmpegRenderer()
        self.scheduler = SchedulePlanner(config, seed=config.random_seed)
        self.queue_exporter = QueueExporter()

    def run(
        self,
        *,
        dry_run: bool = False,
        max_clips: int | None = None,
        force_automated: bool = False,
        now: datetime | None = None,
    ) -> PipelineRunResult:
        self._ensure_runtime_directories()
        state = self._load_state()
        batch = self.intake.pull_batch()
        target_clip_count = max_clips or self.rng.randint(
            self.config.intake.target_videos_min,
            self.config.intake.target_videos_max,
        )

        scheduled_candidates: list[tuple[SongAsset, object, object, object, str]] = []
        outcomes: list[SongOutcome] = []
        for song in batch.ordered_songs:
            if len(scheduled_candidates) >= target_clip_count:
                break
            if self._should_skip(song, state, force_automated=force_automated):
                continue
            song_outcome = self._process_song(
                song,
                remaining_slots=target_clip_count - len(scheduled_candidates),
                scheduled_candidates=scheduled_candidates,
            )
            outcomes.append(song_outcome)
            if song_outcome.status in {"ready", "partial"}:
                state["processed_songs"][song.song_id] = {
                    "title": song.title,
                    "artist": song.artist,
                    "source": song.source,
                    "processed_at": (now or datetime.now().astimezone()).isoformat(),
                    "clip_count": len(song_outcome.clips),
                }

        queue_path: Path | None = None
        queue_ndjson_path: Path | None = None
        rendered_count = 0
        planned_only_count = 0
        failed_count = 0

        if scheduled_candidates:
            rendered_clips = []
            clip_ids = []
            captions = []
            hook_categories = []
            clip_lookup: dict[str, tuple[SongOutcome, int]] = {}
            for song_outcome in outcomes:
                for index, clip in enumerate(song_outcome.clips):
                    clip_lookup[clip.clip_id] = (song_outcome, index)

            for song, lyrics_bundle, segment, style, caption in scheduled_candidates:
                plan = self.render_planner.plan_render(song, segment, lyrics_bundle, style_override=style)
                rendered_clip = self.render_planner.write_render_artifacts(plan)
                if not dry_run:
                    rendered_clip = self.renderer.render(rendered_clip)
                else:
                    rendered_clip.status = "planned_only"
                rendered_clips.append(rendered_clip)
                clip_ids.append(rendered_clip.plan.render_id)
                captions.append(caption)
                hook_categories.append(style.hook_category)
                lookup = clip_lookup.get(rendered_clip.plan.render_id)
                if lookup:
                    song_outcome, clip_index = lookup
                    song_outcome.clips[clip_index].status = rendered_clip.status
                    song_outcome.clips[clip_index].output_path = str(rendered_clip.output_path)
                if rendered_clip.status == "rendered":
                    rendered_count += 1
                elif rendered_clip.status == "planned_only":
                    planned_only_count += 1
                else:
                    failed_count += 1

            jobs = self.scheduler.schedule_jobs(
                clip_ids,
                [clip.output_path for clip in rendered_clips],
                captions,
                hook_categories,
                now=now or datetime.now().astimezone(),
            )
            exported = self.queue_exporter.export(jobs, self.config.paths.upload_queue_file)
            queue_path = exported.json_path
            queue_ndjson_path = exported.ndjson_path

            schedule_lookup = {job.clip_id: job for job in jobs}
            for clip in rendered_clips:
                scheduled_job = schedule_lookup.get(clip.plan.render_id)
                lookup = clip_lookup.get(clip.plan.render_id)
                if lookup and scheduled_job:
                    song_outcome, clip_index = lookup
                    song_outcome.clips[clip_index].scheduled_at = scheduled_job.scheduled_at.isoformat()

        self._save_state(state)
        result = PipelineRunResult(
            target_clip_count=target_clip_count,
            produced_clip_count=sum(len(item.clips) for item in outcomes),
            queue_path=queue_path,
            queue_ndjson_path=queue_ndjson_path,
            songs=outcomes,
            rendered=rendered_count,
            planned_only=planned_only_count,
            failed=failed_count,
        )
        write_json(self.config.paths.output_dir.parent / "run_summary.json", result.to_dict())
        return result

    def _process_song(
        self,
        song: SongAsset,
        *,
        remaining_slots: int,
        scheduled_candidates: list[tuple[SongAsset, object, object, object, str]],
    ) -> SongOutcome:
        try:
            lyrics_bundle = self.lyrics.resolve_lyrics(song)
        except FileNotFoundError as exc:
            return SongOutcome(
                song_id=song.song_id,
                title=song.title,
                artist=song.artist,
                source=song.source,
                status="skipped",
                message=str(exc),
            )

        segments = self.segmenter.select_segments(song, lyrics_bundle.lines)
        if not segments:
            return SongOutcome(
                song_id=song.song_id,
                title=song.title,
                artist=song.artist,
                source=song.source,
                status="skipped",
                message="No usable 30-60s non-overlapping segments found.",
            )

        selected_segments = segments[:remaining_slots]
        outcome = SongOutcome(
            song_id=song.song_id,
            title=song.title,
            artist=song.artist,
            source=song.source,
            status="ready" if len(selected_segments) == len(segments) else "partial",
            message=f"Prepared {len(selected_segments)} clip(s) from {len(segments)} scored segment(s).",
        )
        for segment in selected_segments:
            style = self.styling.decide(song)
            clip_id = self.render_planner.plan_render(song, segment, lyrics_bundle, style_override=style).render_id
            caption = self._build_caption(song, segment.caption_seed, style)
            scheduled_candidates.append((song, lyrics_bundle, segment, style, caption))
            outcome.clips.append(
                ClipOutcome(
                    clip_id=clip_id,
                    song_id=song.song_id,
                    title=song.title,
                    artist=song.artist,
                    status="queued_for_render",
                    output_path="",
                    hook_category=style.hook_category,
                )
            )
        return outcome

    def _build_caption(self, song: SongAsset, caption_seed: str, style: object) -> str:
        hook_category = getattr(style, "hook_category", None) or "underrated songs"
        hook_phrase = getattr(style, "hook_phrase", None)
        base = hook_phrase or caption_seed
        return f"[{hook_category}] {base} | {song.artist} - {song.title}"

    def _should_skip(self, song: SongAsset, state: dict[str, object], *, force_automated: bool) -> bool:
        if song.manual_priority:
            return False
        if force_automated:
            return False
        if not song.audio_path.exists() or not song.audio_path.is_file():
            return True
        return song.song_id in state.get("processed_songs", {})

    def _ensure_runtime_directories(self) -> None:
        ensure_directory(self.config.paths.manual_priority_dir)
        ensure_directory(self.config.paths.automated_queue_dir)
        ensure_directory(self.config.paths.provider_feed_dir)
        ensure_directory(self.config.paths.lyrics_cache_dir)
        ensure_directory(self.config.paths.output_dir)
        ensure_directory(self.config.paths.render_work_dir)

    def _load_state(self) -> dict[str, object]:
        return read_json(self.config.paths.state_file, {"processed_songs": {}})

    def _save_state(self, state: dict[str, object]) -> None:
        write_json(self.config.paths.state_file, state)
