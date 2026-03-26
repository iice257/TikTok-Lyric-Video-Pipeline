from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
import json
import math
import random
import shutil
import subprocess

from ..config import PipelineConfig
from ..hooks import HOOK_CATEGORIES
from ..models import LyricsBundle, LyricLine, LyricToken, SegmentSelection, SongAsset, StyleDecision
from ..utils import ensure_directory, slugify, stable_id, weighted_choice


@dataclass(slots=True)
class SubtitleWord:
    text: str
    start: float
    end: float
    highlight: bool = False


@dataclass(slots=True)
class AssStyle:
    name: str
    fontname: str
    fontsize: int
    primary_colour: str
    secondary_colour: str
    outline_colour: str
    back_colour: str
    bold: bool = True
    italic: bool = False
    alignment: int = 2
    margin_l: int = 84
    margin_r: int = 84
    margin_v: int = 180
    outline: int = 5
    shadow: int = 1
    encoding: int = 1


@dataclass(slots=True)
class AssLine:
    start: float
    end: float
    text: str
    style: str = "Default"
    layer: int = 0
    name: str = ""
    margin_l: int = 0
    margin_r: int = 0
    margin_v: int = 0
    effect: str = ""
    words: list[SubtitleWord] = field(default_factory=list)


@dataclass(slots=True)
class RenderPlan:
    song: SongAsset
    segment: SegmentSelection
    style: StyleDecision
    render_id: str
    output_dir: Path
    work_dir: Path
    ass_path: Path
    manifest_path: Path
    output_video_path: Path
    background_path: Path | None
    album_cover_path: Path | None
    duration_seconds: float
    layout_description: str
    ffmpeg_command: list[str]
    ass_document: str
    manifest: dict[str, Any]


@dataclass(slots=True)
class RenderedClip:
    plan: RenderPlan
    output_path: Path
    ass_path: Path
    manifest_path: Path
    ffmpeg_command: list[str]
    status: str = "planned"

    def to_dict(self) -> dict[str, Any]:
        return {
            "clip_id": self.plan.render_id,
            "song_id": self.plan.song.song_id,
            "segment_id": self.plan.segment.segment_id,
            "output_path": str(self.output_path),
            "ass_path": str(self.ass_path),
            "manifest_path": str(self.manifest_path),
            "status": self.status,
            "layout": self.plan.layout_description,
        }


class RenderPlanner:
    lyric_style_distribution = (
        ("karaoke", 35.0),
        ("stacked_3_line", 35.0),
        ("line_swap", 20.0),
        ("beat_pulse", 10.0),
    )

    layout_distribution = (
        ("blurred_cover_center_lyrics", 40.0),
        ("fullscreen_cover_overlay", 30.0),
        ("blurred_background_small_cover", 20.0),
        ("minimal_typography_black", 10.0),
    )

    font_distribution = (
        ("bold_sans", 70.0),
        ("editorial_serif", 15.0),
        ("cursive", 10.0),
        ("experimental", 5.0),
    )

    def __init__(self, config: PipelineConfig, seed: int | None = None) -> None:
        self.config = config
        self.rng = random.Random(config.random_seed if seed is None else seed)

    def plan_render(
        self,
        song: SongAsset,
        segment: SegmentSelection,
        lyrics: LyricsBundle,
        *,
        output_root: Path | None = None,
        work_root: Path | None = None,
        style_override: StyleDecision | None = None,
    ) -> RenderPlan:
        output_dir = ensure_directory(output_root or self.config.paths.output_dir)
        work_dir = ensure_directory(work_root or self.config.paths.render_work_dir)
        render_id = stable_id(song.song_id, segment.segment_id, f"{segment.start:.3f}", f"{segment.end:.3f}")
        style = style_override or self.choose_style(song, lyrics, segment)
        ass_path = work_dir / f"{slugify(song.title)}-{render_id}.ass"
        manifest_path = work_dir / f"{slugify(song.title)}-{render_id}.json"
        output_video_path = output_dir / f"{slugify(song.artist)}-{slugify(song.title)}-{render_id}.mp4"
        ass_document, ass_lines = self.build_ass_document(song, segment, lyrics, style)
        layout_description = self.describe_layout(style, song, segment)
        ffmpeg_command = self.build_ffmpeg_command(song, segment, ass_path, output_video_path, style, layout_description)
        manifest = {
            "render_id": render_id,
            "song_id": song.song_id,
            "segment_id": segment.segment_id,
            "song_title": song.title,
            "artist": song.artist,
            "audio_path": str(song.audio_path),
            "output_path": str(output_video_path),
            "ass_path": str(ass_path),
            "style": asdict(style),
            "layout_description": layout_description,
            "segment": {
                "start": segment.start,
                "end": segment.end,
                "duration": segment.duration,
                "score": segment.score,
                "reason": segment.reason,
                "caption_seed": segment.caption_seed,
            },
            "ass_lines": [self.ass_line_to_dict(line) for line in ass_lines],
            "ffmpeg_command": ffmpeg_command,
        }
        return RenderPlan(
            song=song,
            segment=segment,
            style=style,
            render_id=render_id,
            output_dir=output_dir,
            work_dir=work_dir,
            ass_path=ass_path,
            manifest_path=manifest_path,
            output_video_path=output_video_path,
            background_path=self.resolve_background_path(song),
            album_cover_path=song.album_cover_path,
            duration_seconds=segment.duration,
            layout_description=layout_description,
            ffmpeg_command=ffmpeg_command,
            ass_document=ass_document,
            manifest=manifest,
        )

    def choose_style(self, song: SongAsset, lyrics: LyricsBundle, segment: SegmentSelection) -> StyleDecision:
        lyric_style = weighted_choice(self.rng, self.lyric_style_distribution)
        layout_template = weighted_choice(self.rng, self.layout_distribution)
        font_bucket = weighted_choice(self.rng, self.font_distribution)
        font_family = self.pick_font(font_bucket)
        use_album_palette = self.rng.random() < 0.10
        base_color = "black" if layout_template in {"fullscreen_cover_overlay", "blurred_cover_center_lyrics"} else "white"
        highlight_color = self.pick_highlight_color(base_color, use_album_palette)
        hook_category, hook_phrase = self.pick_hook_phrase(song, segment)
        return StyleDecision(
            lyric_style=lyric_style,
            layout_template=layout_template,
            font_family=font_family,
            text_color=base_color,
            highlight_color=highlight_color,
            use_album_palette=use_album_palette,
            hook_category=hook_category,
            hook_phrase=hook_phrase,
        )

    def pick_hook_phrase(self, song: SongAsset, segment: SegmentSelection) -> tuple[str | None, str | None]:
        categories = list(HOOK_CATEGORIES.keys())
        if not categories:
            return None, None
        category = categories[self.rng.randrange(len(categories))]
        phrases = HOOK_CATEGORIES[category]
        if not phrases or self.rng.random() >= 0.50:
            return category, None
        selected = phrases[self.rng.randrange(len(phrases))]
        return category, selected

    def pick_font(self, font_bucket: str) -> str:
        fonts = self.config.render.default_fonts.get(font_bucket)
        if not fonts:
            return "Arial Bold"
        return fonts[self.rng.randrange(len(fonts))]

    def pick_highlight_color(self, base_color: str, use_album_palette: bool) -> str:
        if use_album_palette:
            palette = ["#f4b942", "#e8d8c3", "#ffffff", "#111111", "#ffda77"]
            return palette[self.rng.randrange(len(palette))]
        if base_color == "black":
            return self.rng.choice(["white", "yellow"])
        return self.rng.choice(["black", "yellow"])

    def describe_layout(self, style: StyleDecision, song: SongAsset, segment: SegmentSelection) -> str:
        if style.layout_template == "blurred_cover_center_lyrics":
            return "Blurred album-art background with centered cover and lyrics below"
        if style.layout_template == "fullscreen_cover_overlay":
            return "Fullscreen album cover with lyric overlay"
        if style.layout_template == "blurred_background_small_cover":
            return "Blurred animated background with a small cover and centered lyrics"
        return "Minimal typography on a black background"

    def resolve_background_path(self, song: SongAsset) -> Path | None:
        if song.album_cover_path:
            return song.album_cover_path
        return None

    def build_ass_document(self, song: SongAsset, segment: SegmentSelection, lyrics: LyricsBundle, style: StyleDecision) -> tuple[str, list[AssLine]]:
        lines = self._rebase_lines(
            self.select_lines_for_segment(lyrics.lines, segment.start, segment.end),
            segment.start,
            segment.end,
        )
        ass_lines = self.build_ass_lines(lines, style, segment)
        header = self.ass_header(style)
        body = "\n".join(self.ass_line_to_ass(line) for line in ass_lines)
        return header + body, ass_lines

    def select_lines_for_segment(self, lines: list[LyricLine], start: float, end: float) -> list[LyricLine]:
        selected = [line for line in lines if line.end >= start and line.start <= end]
        if selected:
            return selected
        return lines[: min(5, len(lines))]

    def build_ass_lines(self, lines: list[LyricLine], style: StyleDecision, segment: SegmentSelection) -> list[AssLine]:
        if not lines:
            placeholder = self.fallback_ass_lines(segment)
            return placeholder

        if style.lyric_style in {"karaoke", "karaoke_highlight"}:
            return self.build_karaoke_ass_lines(lines, style, segment)
        if style.lyric_style in {"stacked_3_line", "stacked_three_line"}:
            return self.build_stacked_ass_lines(lines, style, segment)
        if style.lyric_style == "line_swap":
            return self.build_line_swap_ass_lines(lines, style, segment)
        return self.build_beat_pulse_ass_lines(lines, style, segment)

    def fallback_ass_lines(self, segment: SegmentSelection) -> list[AssLine]:
        return [
            AssLine(0.0, 3.0, "{\\b1}Lyrics unavailable{\\b0}", "Default", layer=1),
            AssLine(3.0, max(segment.duration, 4.0), "{\\i1}Using segment caption seed{\\i0}", "Default", layer=1),
        ]

    def build_karaoke_ass_lines(self, lines: list[LyricLine], style: StyleDecision, segment: SegmentSelection) -> list[AssLine]:
        ass_lines: list[AssLine] = []
        for lyric_line in lines:
            words = self.line_to_words(lyric_line)
            karaoke_text = self.karaoke_tags(words)
            ass_lines.append(
                AssLine(
                    start=max(0.0, lyric_line.start),
                    end=min(segment.duration, lyric_line.end),
                    text=karaoke_text,
                    style="Karaoke",
                    words=words,
                )
            )
        return ass_lines

    def build_stacked_ass_lines(self, lines: list[LyricLine], style: StyleDecision, segment: SegmentSelection) -> list[AssLine]:
        ass_lines: list[AssLine] = []
        for index, lyric_line in enumerate(lines):
            prev_line = lines[index - 1].text if index > 0 else ""
            next_line = lines[index + 1].text if index + 1 < len(lines) else ""
            highlighted_current = f"{{\\c{self.ass_colour(style.highlight_color)}}}{lyric_line.text}{{\\r}}"
            stacked = "\n".join(part for part in [prev_line, highlighted_current, next_line] if part)
            ass_lines.append(
                AssLine(
                    start=max(0.0, lyric_line.start),
                    end=min(segment.duration, lyric_line.end),
                    text=stacked,
                    style="Stacked",
                )
            )
        return ass_lines

    def build_line_swap_ass_lines(self, lines: list[LyricLine], style: StyleDecision, segment: SegmentSelection) -> list[AssLine]:
        ass_lines: list[AssLine] = []
        for lyric_line in lines:
            ass_lines.append(
                AssLine(
                    start=max(0.0, lyric_line.start),
                    end=min(segment.duration, lyric_line.end),
                    text=lyric_line.text,
                    style="Swap",
                )
            )
        return ass_lines

    def build_beat_pulse_ass_lines(self, lines: list[LyricLine], style: StyleDecision, segment: SegmentSelection) -> list[AssLine]:
        ass_lines: list[AssLine] = []
        for lyric_line in lines:
            ass_lines.append(
                AssLine(
                    start=max(0.0, lyric_line.start),
                    end=min(segment.duration, lyric_line.end),
                    text=f"{{\\t(0,250,\\fscx115\\fscy115)}}{lyric_line.text}",
                    style="Pulse",
                )
            )
        return ass_lines

    def line_to_words(self, lyric_line: LyricLine) -> list[SubtitleWord]:
        tokens = lyric_line.tokens or self.tokenize_line(lyric_line)
        return [SubtitleWord(token.text, token.start, token.end) for token in tokens]

    def tokenize_line(self, lyric_line: LyricLine) -> list[SubtitleWord]:
        words = lyric_line.text.split()
        if not words:
            return []
        span = max(lyric_line.end - lyric_line.start, self.config.alignment.min_line_duration)
        step = span / len(words)
        tokens: list[SubtitleWord] = []
        cursor = lyric_line.start
        for word in words:
            start = cursor
            end = min(lyric_line.end, cursor + step)
            tokens.append(SubtitleWord(word, start, end))
            cursor = end
        return tokens

    def karaoke_tags(self, words: list[SubtitleWord]) -> str:
        if not words:
            return ""
        parts = []
        for index, word in enumerate(words):
            prefix = "{\\k%d}" % max(1, int(math.ceil((word.end - word.start) * 100)))
            parts.append(prefix + self.escape_ass_text(word.text))
        return " ".join(parts)

    def ass_header(self, style: StyleDecision) -> str:
        style_rows = [self.ass_style_from_decision(style, name="Default")]
        style_rows.append(self.ass_style_from_decision(style, name="Karaoke"))
        style_rows.append(self.ass_style_from_decision(style, name="Stacked", fontsize_delta=4, margin_v=210))
        style_rows.append(self.ass_style_from_decision(style, name="Swap", fontsize_delta=8))
        style_rows.append(self.ass_style_from_decision(style, name="Pulse", fontsize_delta=10))
        lines = [
            "[Script Info]",
            "ScriptType: v4.00+",
            "PlayResX: 1080",
            "PlayResY: 1920",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Alignment,MarginL,MarginR,MarginV,Outline,Shadow,Encoding",
        ]
        for style_row in style_rows:
            lines.append(
                "Style: {name},{fontname},{fontsize},{primary_colour},{secondary_colour},{outline_colour},{back_colour},{bold},{italic},{alignment},{margin_l},{margin_r},{margin_v},{outline},{shadow},{encoding}".format(
                    **asdict(style_row)
                )
            )
        lines.extend(
            [
                "",
                "[Events]",
                "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
            ]
        )
        return "\n".join(lines) + "\n"

    def ass_style_from_decision(
        self,
        style: StyleDecision,
        *,
        name: str = "Default",
        fontsize_delta: int = 0,
        margin_v: int | None = None,
    ) -> AssStyle:
        fontsize = 74 if style.layout_template == "minimal_typography_black" else 62
        if style.lyric_style in {"karaoke", "karaoke_highlight"}:
            fontsize = 58
        return AssStyle(
            name=name,
            fontname=style.font_family,
            fontsize=fontsize + fontsize_delta,
            primary_colour=self.ass_colour(style.text_color),
            secondary_colour=self.ass_colour(style.highlight_color),
            outline_colour=self.ass_colour("black" if style.text_color != "black" else "white"),
            back_colour=self.ass_colour("black"),
            margin_v=margin_v or 180,
        )

    def ass_colour(self, value: str) -> str:
        mapping = {
            "black": "&H000000&",
            "white": "&H00FFFFFF&",
            "yellow": "&H0000FFFF&",
        }
        if value in mapping:
            return mapping[value]
        if value.startswith("#") and len(value) == 7:
            red = value[1:3]
            green = value[3:5]
            blue = value[5:7]
            return f"&H00{blue}{green}{red}&"
        return "&H00FFFFFF&"

    def ass_line_to_ass(self, line: AssLine) -> str:
        start = self.format_ass_time(line.start)
        end = self.format_ass_time(line.end)
        text = line.text if "{\\" in line.text else self.escape_ass_text(line.text)
        return f"Dialogue: {line.layer},{start},{end},{line.style},{line.name},{line.margin_l},{line.margin_r},{line.margin_v},{line.effect},{text}"

    def ass_line_to_dict(self, line: AssLine) -> dict[str, Any]:
        return {
            "start": line.start,
            "end": line.end,
            "text": line.text,
            "style": line.style,
            "layer": line.layer,
            "words": [asdict(word) for word in line.words],
        }

    def format_ass_time(self, value: float) -> str:
        total = max(0.0, value)
        hours = int(total // 3600)
        minutes = int((total % 3600) // 60)
        seconds = total % 60
        return f"{hours:d}:{minutes:02d}:{seconds:05.2f}"

    def escape_ass_text(self, text: str) -> str:
        return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", r"\N")

    def build_ffmpeg_command(
        self,
        song: SongAsset,
        segment: SegmentSelection,
        ass_path: Path,
        output_path: Path,
        style: StyleDecision,
        layout_description: str,
    ) -> list[str]:
        duration = f"{segment.duration:.3f}"
        filters = self.build_filter_chain(song, ass_path, style, layout_description, segment)
        command = [
            "ffmpeg",
            "-y",
        ]
        if song.album_cover_path:
            command += ["-loop", "1", "-i", str(song.album_cover_path)]
        else:
            command += [
                "-f",
                "lavfi",
                "-i",
                f"color=c=black:s={self.config.render.width}x{self.config.render.height}:r={self.config.render.fps}",
            ]
        command += ["-i", str(song.audio_path)]
        command += [
            "-ss",
            f"{segment.start:.3f}",
            "-t",
            duration,
            "-filter_complex",
            filters,
            "-map",
            "[vout]",
            "-map",
            "1:a",
            "-r",
            str(self.config.render.fps),
            "-c:v",
            self.config.render.video_codec,
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            self.config.render.audio_codec,
            "-b:a",
            "192k",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
        return command

    def build_filter_chain(
        self,
        song: SongAsset,
        ass_path: Path,
        style: StyleDecision,
        layout_description: str,
        segment: SegmentSelection,
    ) -> str:
        width = self.config.render.width
        height = self.config.render.height
        ass_filter = f"ass={self.escape_filter_path(ass_path)}"
        if style.layout_template == "minimal_typography_black":
            return (
                f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},drawbox=x=0:y=0:w=iw:h=ih:color=black@1.0:t=fill,{ass_filter}[vout]"
            )
        if song.album_cover_path:
            if style.layout_template == "fullscreen_cover_overlay":
                return (
                    f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
                    f"crop={width}:{height},{ass_filter}[vout]"
                )
            overlay_width = 420 if style.layout_template == "blurred_cover_center_lyrics" else 300
            return (
                f"[0:v]split[base][art];"
                f"[base]scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},boxblur=24:1,noise=alls={self.config.render.grain_strength}:allf=t+u,"
                f"eq=contrast=1.06:saturation=1.08,"
                f"zoompan=z='min(1.08,1+0.0005*on)':d=1:s={width}x{height}[bg];"
                f"[art]scale={overlay_width}:-1[cover];"
                f"[bg][cover]overlay=(W-w)/2:(H-h)/2:shortest=1,{ass_filter}[vout]"
            )
        return (
            f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},drawbox=x=0:y=0:w=iw:h=ih:color=black@1.0:t=fill,{ass_filter}[vout]"
        )

    def escape_filter_path(self, path: Path) -> str:
        text = str(path).replace("\\", "\\\\").replace(":", r"\:")
        return text

    def _rebase_lines(self, lines: list[LyricLine], clip_start: float, clip_end: float) -> list[LyricLine]:
        rebased: list[LyricLine] = []
        for line in lines:
            start = max(line.start, clip_start) - clip_start
            end = min(line.end, clip_end) - clip_start
            if end <= 0:
                continue
            rebased_tokens = []
            for token in line.tokens:
                token_start = max(token.start, clip_start) - clip_start
                token_end = min(token.end, clip_end) - clip_start
                if token_end <= 0:
                    continue
                rebased_tokens.append(LyricToken(token.text, token_start, token_end))
            rebased.append(
                LyricLine(
                    text=line.text,
                    start=max(start, 0.0),
                    end=max(end, start + 0.1),
                    tokens=rebased_tokens,
                    source_format=line.source_format,
                )
            )
        return rebased

    def write_render_artifacts(self, plan: RenderPlan) -> RenderedClip:
        ensure_directory(plan.work_dir)
        ensure_directory(plan.output_dir)
        plan.ass_path.write_text(plan.ass_document, encoding="utf-8")
        plan.manifest_path.write_text(json.dumps(plan.manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        return RenderedClip(
            plan=plan,
            output_path=plan.output_video_path,
            ass_path=plan.ass_path,
            manifest_path=plan.manifest_path,
            ffmpeg_command=plan.ffmpeg_command,
            status="planned",
        )


class FFmpegRenderer:
    def __init__(self, ffmpeg_binary: str = "ffmpeg") -> None:
        self.ffmpeg_binary = ffmpeg_binary

    def is_available(self) -> bool:
        return shutil.which(self.ffmpeg_binary) is not None

    def render(self, clip: RenderedClip) -> RenderedClip:
        if not self.is_available():
            clip.status = "planned_only"
            return clip
        command = list(clip.ffmpeg_command)
        command[0] = self.ffmpeg_binary
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            clip.status = "rendered"
            return clip
        clip.status = "render_failed"
        clip.plan.manifest["ffmpeg_stderr"] = result.stderr
        clip.manifest_path.write_text(json.dumps(clip.plan.manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        return clip
