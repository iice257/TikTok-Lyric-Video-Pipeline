from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class AudioSection:
    start: float
    duration: float
    loudness: float | None = None
    tempo: float | None = None
    danceability: float | None = None
    energy: float | None = None
    confidence: float = 0.0

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass(slots=True)
class LyricToken:
    text: str
    start: float
    end: float


@dataclass(slots=True)
class LyricLine:
    text: str
    start: float
    end: float
    tokens: list[LyricToken] = field(default_factory=list)
    source_format: str = "unknown"


@dataclass(slots=True)
class SongAsset:
    song_id: str
    title: str
    artist: str
    audio_path: Path
    source: str
    album_cover_path: Path | None = None
    manual_priority: bool = False
    spotify_track_id: str | None = None
    tiktok_audio_id: str | None = None
    lyrics_path: Path | None = None
    duration_seconds: float | None = None
    audio_features: dict[str, Any] = field(default_factory=dict)
    sections: list[AudioSection] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["audio_path"] = str(self.audio_path)
        payload["album_cover_path"] = str(self.album_cover_path) if self.album_cover_path else None
        payload["lyrics_path"] = str(self.lyrics_path) if self.lyrics_path else None
        return payload


@dataclass(slots=True)
class LyricsBundle:
    lines: list[LyricLine]
    source_name: str
    was_aligned: bool = False
    raw_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SegmentCandidate:
    start: float
    end: float
    score: float
    reason: str
    repeated_phrase: str | None = None
    loudness_score: float = 0.0
    repetition_score: float = 0.0
    musicality_score: float = 0.0

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(slots=True)
class SegmentSelection:
    segment_id: str
    song_id: str
    start: float
    end: float
    score: float
    reason: str
    caption_seed: str

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(slots=True)
class StyleDecision:
    lyric_style: str
    layout_template: str
    font_family: str
    text_color: str
    highlight_color: str
    use_album_palette: bool
    hook_category: str | None
    hook_phrase: str | None


@dataclass(slots=True)
class RenderArtifact:
    clip_id: str
    segment_id: str
    output_path: Path
    ass_path: Path
    manifest_path: Path
    ffmpeg_command: list[str]
    render_status: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "clip_id": self.clip_id,
            "segment_id": self.segment_id,
            "output_path": str(self.output_path),
            "ass_path": str(self.ass_path),
            "manifest_path": str(self.manifest_path),
            "ffmpeg_command": self.ffmpeg_command,
            "render_status": self.render_status,
        }


@dataclass(slots=True)
class ScheduledUpload:
    clip_id: str
    video_path: Path
    caption: str
    hook_category: str | None
    scheduled_at: datetime
    upload_window_start: datetime
    upload_window_end: datetime
    platform: str = "tiktok"
    publish_state: str = "scheduled"
    extra_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["video_path"] = str(self.video_path)
        payload["scheduled_at"] = self.scheduled_at.isoformat()
        payload["upload_window_start"] = self.upload_window_start.isoformat()
        payload["upload_window_end"] = self.upload_window_end.isoformat()
        return payload
