"""Short sample renders of each preset, so a look can be judged in motion before using it."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import threading

from tiktok_lyric_pipeline.config import PipelineConfig
from tiktok_lyric_pipeline.models import LyricLine, LyricsBundle, SegmentSelection, SongAsset
from tiktok_lyric_pipeline.presets import Preset
from tiktok_lyric_pipeline.stages.rendering import FFmpegRenderer, RenderPlanner
from tiktok_lyric_pipeline.stages.styling import StyleDecisionEngine

PREVIEW_SECONDS = 7.0
# Bump when the sample media or render settings change so cached previews are rebuilt.
PREVIEW_VERSION = "2"
SAMPLE_LINES = [
    "Lights low on the boulevard",
    "Hold on, hold on",
    "Never let it go",
    "Turn it up and let it ring",
]

_lock = threading.Lock()


class PreviewUnavailable(RuntimeError):
    pass


def _ffmpeg() -> str:
    return os.getenv("FFMPEG_BINARY") or "ffmpeg"


def _ensure_sample_media(directory: Path) -> tuple[Path, Path]:
    """A 120 BPM kick and offbeat hat over a bass note, and a gradient cover. Generated once.

    A pure-sine chord is avoided on purpose: its tones beat against each other slowly enough to
    look like rhythm to the beat tracker, which real recordings don't do.
    """
    audio = directory / "sample.wav"
    cover = directory / "sample-cover.png"
    directory.mkdir(parents=True, exist_ok=True)
    if not audio.exists():
        kick = "0.75*exp(-28*mod(t,0.5))*sin(2*PI*55*mod(t,0.5))"
        hat = "0.12*exp(-70*mod(t+0.25,0.5))*(random(0)*2-1)"
        bass = "0.15*sin(2*PI*110*t)"
        _run([_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{kick}+{hat}+{bass}':s=44100:d={PREVIEW_SECONDS}", str(audio)])
    if not cover.exists():
        _run([_ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=800x800:c0=0xf2a65a:c1=0x3a1408:duration=1", "-frames:v", "1", str(cover)])
    return audio, cover


def _run(command: list[str]) -> None:
    try:
        result = subprocess.run(command, capture_output=True, check=False, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PreviewUnavailable(f"ffmpeg could not run: {exc}") from exc
    if result.returncode != 0:
        raise PreviewUnavailable(result.stderr.decode(errors="replace")[-400:] or "ffmpeg failed")


def _sample_lyrics() -> LyricsBundle:
    step = PREVIEW_SECONDS / len(SAMPLE_LINES)
    lines = [LyricLine(text=text, start=index * step + 0.1, end=(index + 1) * step, source_format="lrc") for index, text in enumerate(SAMPLE_LINES)]
    return LyricsBundle(lines=lines, source_name="preview")


def preview_path(config: PipelineConfig, preset: Preset) -> Path:
    fingerprint = hashlib.sha256(json.dumps([PREVIEW_VERSION, preset.to_dict()], sort_keys=True).encode()).hexdigest()[:12]
    return config.paths.output_dir.parent / "previews" / f"{preset.id}-{fingerprint}.mp4"


def render_preview(config: PipelineConfig, preset: Preset) -> Path:
    """Return a cached preview clip for the preset, rendering it on first request."""
    if preset.is_random:
        raise PreviewUnavailable("'Surprise me' has no single look to preview.")
    target = preview_path(config, preset)
    with _lock:
        if target.exists():
            return target
        directory = target.parent
        audio, cover = _ensure_sample_media(directory)
        song = SongAsset(song_id="preview", title="Preview", artist="SSS", audio_path=audio, source="preview", album_cover_path=cover)
        segment = SegmentSelection(segment_id=preset.id, song_id="preview", start=0.0, end=PREVIEW_SECONDS, score=1.0, reason="preview", caption_seed="")
        style = StyleDecisionEngine(config.render, random.Random(0)).from_preset(preset)
        planner = RenderPlanner(config)
        plan = planner.plan_render(song, segment, _sample_lyrics(), output_root=directory, work_root=directory / "work", style_override=style)
        rendered = FFmpegRenderer().render(planner.write_render_artifacts(plan))
        if rendered.status != "rendered":
            raise PreviewUnavailable("Rendering the preview failed. Is ffmpeg installed?")
        rendered.output_path.replace(target)
        return target
