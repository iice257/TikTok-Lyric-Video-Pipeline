from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from tiktok_lyric_pipeline.config import PipelineConfig
from tiktok_lyric_pipeline.models import AudioSection, LyricLine, LyricToken, LyricsBundle, SongAsset, StyleDecision
from tiktok_platform.models import Clip, LyricsArtifact, SegmentCandidate, Song


def song_to_asset(song: Song) -> SongAsset:
    sections = [
        AudioSection(
            start=float(section.get("start", 0.0)),
            duration=float(section.get("duration", 0.0)),
            loudness=float(section["loudness"]) if section.get("loudness") is not None else None,
            tempo=float(section["tempo"]) if section.get("tempo") is not None else None,
            danceability=float(section["danceability"]) if section.get("danceability") is not None else None,
            energy=float(section["energy"]) if section.get("energy") is not None else None,
            confidence=float(section.get("confidence", 0.0)),
        )
        for section in song.sections_json
    ]
    return SongAsset(
        song_id=song.song_key,
        title=song.title,
        artist=song.artist,
        audio_path=Path(song.audio_path),
        source=song.provider_name or song.source_type,
        album_cover_path=Path(song.cover_path) if song.cover_path else None,
        manual_priority=song.manual_priority,
        lyrics_path=Path(song.lyrics_path) if song.lyrics_path else None,
        duration_seconds=song.duration_seconds,
        audio_features=song.audio_features_json,
        sections=sections,
        metadata=song.metadata_json,
    )


def lyrics_artifact_to_bundle(artifact: LyricsArtifact) -> LyricsBundle:
    lines = [
        LyricLine(
            text=str(line["text"]),
            start=float(line["start"]),
            end=float(line["end"]),
            tokens=[
                LyricToken(text=str(token["text"]), start=float(token["start"]), end=float(token["end"]))
                for token in line.get("tokens", [])
            ],
            source_format=str(line.get("source_format", artifact.source_format)),
        )
        for line in artifact.lines_json
    ]
    return LyricsBundle(
        lines=lines,
        source_name=artifact.source_name,
        was_aligned=artifact.was_aligned,
        raw_payload=artifact.raw_payload_json,
    )


def segment_candidate_to_selection(segment: SegmentCandidate, song_key: str):
    from tiktok_lyric_pipeline.models import SegmentSelection

    return SegmentSelection(
        segment_id=segment.id,
        song_id=song_key,
        start=segment.start_second,
        end=segment.end_second,
        score=segment.score,
        reason=segment.reason,
        caption_seed=segment.caption_seed,
    )


def clip_to_style(clip: Clip) -> StyleDecision:
    return StyleDecision(
        lyric_style=clip.lyric_style,
        layout_template=clip.layout_template,
        font_family=clip.font_family,
        text_color=clip.text_color,
        highlight_color=clip.highlight_color,
        use_album_palette=clip.highlight_color.startswith("#"),
        hook_category=clip.hook_category,
        hook_phrase=None,
    )


def build_pipeline_config(path: Path) -> PipelineConfig:
    return PipelineConfig.from_json(path) if path.exists() else PipelineConfig.default(Path.cwd())


def new_job_key(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"
