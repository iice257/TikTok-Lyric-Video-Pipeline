from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class PathsConfig:
    manual_priority_dir: Path
    automated_queue_dir: Path
    provider_feed_dir: Path
    lyrics_cache_dir: Path
    output_dir: Path
    render_work_dir: Path
    upload_queue_file: Path
    state_file: Path


@dataclass(slots=True)
class IntakeConfig:
    target_videos_min: int = 10
    target_videos_max: int = 15
    manual_extensions: tuple[str, ...] = (".mp3", ".wav", ".m4a", ".flac")
    automated_feed_files: tuple[str, ...] = ("spotify_trending.json", "tiktok_trending.json")


@dataclass(slots=True)
class LyricsConfig:
    allowed_formats: tuple[str, ...] = (".lrc", ".srt", ".json", ".txt")
    public_source_order: tuple[str, ...] = ("local-sidecar", "cache", "json-feed", "remote-url")
    use_alignment_fallback: bool = True


@dataclass(slots=True)
class AlignmentConfig:
    lead_in_seconds: float = 0.4
    lead_out_seconds: float = 0.3
    chars_per_second: float = 14.0
    min_line_duration: float = 1.1
    max_line_duration: float = 6.2


@dataclass(slots=True)
class SegmentConfig:
    min_duration_seconds: float = 30.0
    max_duration_seconds: float = 60.0
    target_duration_seconds: float = 43.0
    max_segments_per_song: int = 5
    min_segments_per_song: int = 3
    min_gap_seconds: float = 4.0
    chorus_window_lines: int = 4


@dataclass(slots=True)
class RenderConfig:
    width: int = 1080
    height: int = 1920
    fps: int = 30
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    bitrate: str = "8M"
    grain_strength: int = 12
    default_fonts: dict[str, list[str]] = field(
        default_factory=lambda: {
            "bold_sans": ["Montserrat ExtraBold", "Poppins ExtraBold", "Arial Bold"],
            "editorial_serif": ["Cormorant Garamond Bold", "Georgia Bold", "Times New Roman Bold"],
            "cursive": ["Pacifico", "Segoe Script", "Brush Script MT"],
            "experimental": ["Anton", "Impact", "Bebas Neue"],
        }
    )


@dataclass(slots=True)
class ScheduleConfig:
    upload_window_start_hour: int = 1
    upload_window_end_hour: int = 5
    publish_hour_buckets: tuple[int, ...] = (8, 10, 12, 14, 16, 18, 20, 22)


@dataclass(slots=True)
class PipelineConfig:
    root_dir: Path
    paths: PathsConfig
    intake: IntakeConfig = field(default_factory=IntakeConfig)
    lyrics: LyricsConfig = field(default_factory=LyricsConfig)
    alignment: AlignmentConfig = field(default_factory=AlignmentConfig)
    segments: SegmentConfig = field(default_factory=SegmentConfig)
    render: RenderConfig = field(default_factory=RenderConfig)
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)
    random_seed: int = 7

    @classmethod
    def default(cls, root_dir: Path) -> "PipelineConfig":
        data_root = root_dir / "data"
        output_root = root_dir / "output"
        return cls(
            root_dir=root_dir,
            paths=PathsConfig(
                manual_priority_dir=data_root / "manual_priority",
                automated_queue_dir=data_root / "automated_queue",
                provider_feed_dir=data_root / "provider_feeds",
                lyrics_cache_dir=data_root / "lyrics_cache",
                output_dir=output_root / "videos",
                render_work_dir=output_root / "render_work",
                upload_queue_file=output_root / "scheduled_uploads.json",
                state_file=output_root / "pipeline_state.json",
            ),
        )

    @classmethod
    def from_json(cls, path: Path) -> "PipelineConfig":
        payload = json.loads(path.read_text(encoding="utf-8"))
        root_dir = path.parent.parent if path.parent.name == "config" else path.parent
        default = cls.default(root_dir)
        return cls._merge(default, payload, source_path=path, root_base=root_dir)

    @classmethod
    def _merge(
        cls,
        default: "PipelineConfig",
        payload: dict[str, Any],
        *,
        source_path: Path,
        root_base: Path,
    ) -> "PipelineConfig":
        def merged_dict(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
            result = dict(base)
            for key, value in override.items():
                if isinstance(value, dict) and isinstance(result.get(key), dict):
                    result[key] = merged_dict(result[key], value)
                else:
                    result[key] = value
            return result

        base = {
            "root_dir": str(default.root_dir),
            "paths": {
                "manual_priority_dir": str(default.paths.manual_priority_dir),
                "automated_queue_dir": str(default.paths.automated_queue_dir),
                "provider_feed_dir": str(default.paths.provider_feed_dir),
                "lyrics_cache_dir": str(default.paths.lyrics_cache_dir),
                "output_dir": str(default.paths.output_dir),
                "render_work_dir": str(default.paths.render_work_dir),
                "upload_queue_file": str(default.paths.upload_queue_file),
                "state_file": str(default.paths.state_file),
            },
            "intake": asdict(default.intake),
            "lyrics": asdict(default.lyrics),
            "alignment": asdict(default.alignment),
            "segments": asdict(default.segments),
            "render": {
                "width": default.render.width,
                "height": default.render.height,
                "fps": default.render.fps,
                "video_codec": default.render.video_codec,
                "audio_codec": default.render.audio_codec,
                "bitrate": default.render.bitrate,
                "grain_strength": default.render.grain_strength,
                "default_fonts": default.render.default_fonts,
            },
            "schedule": asdict(default.schedule),
            "random_seed": default.random_seed,
        }
        merged = merged_dict(base, payload)
        resolved_root = Path(merged["root_dir"])
        if not resolved_root.is_absolute():
            resolved_root = (root_base / resolved_root).resolve()

        def resolve_path(value: str | Path) -> Path:
            path_value = Path(value)
            if path_value.is_absolute():
                return path_value
            return (resolved_root / path_value).resolve()

        return cls(
            root_dir=resolved_root,
            paths=PathsConfig(**{key: resolve_path(value) for key, value in merged["paths"].items()}),
            intake=IntakeConfig(**merged["intake"]),
            lyrics=LyricsConfig(**merged["lyrics"]),
            alignment=AlignmentConfig(**merged["alignment"]),
            segments=SegmentConfig(**merged["segments"]),
            render=RenderConfig(**merged["render"]),
            schedule=ScheduleConfig(**merged["schedule"]),
            random_seed=merged["random_seed"],
        )
