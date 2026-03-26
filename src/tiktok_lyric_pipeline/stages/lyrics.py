from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

from ..config import PipelineConfig
from ..models import LyricsBundle, LyricLine, LyricToken, SongAsset
from ..utils import ensure_directory, read_json
from .alignment import LightweightLyricAligner

LRC_PATTERN = re.compile(r"\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?](.*)")
SRT_TIMECODE_PATTERN = re.compile(
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


class LyricsService:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self.aligner = LightweightLyricAligner(config.alignment)

    def resolve_lyrics(self, song: SongAsset) -> LyricsBundle:
        discovered = self._discover_sources(song)
        for source_name, path in discovered:
            bundle = self._parse_lyrics_file(path, source_name)
            if bundle:
                return bundle

        untimed_lines = self._load_untimed_lines(song)
        if untimed_lines and self.config.lyrics.use_alignment_fallback:
            aligned = self.aligner.align(
                untimed_lines,
                duration_seconds=song.duration_seconds,
                sections=song.sections,
            )
            return LyricsBundle(
                lines=aligned,
                source_name="lightweight-alignment",
                was_aligned=True,
                raw_payload={"line_count": len(untimed_lines)},
            )
        raise FileNotFoundError(f"No lyrics found for {song.artist} - {song.title}")

    def _discover_sources(self, song: SongAsset) -> list[tuple[str, Path]]:
        sources: list[tuple[str, Path]] = []
        if song.lyrics_path and song.lyrics_path.exists():
            sources.append(("local-sidecar", song.lyrics_path))

        cache_root = ensure_directory(self.config.paths.lyrics_cache_dir)
        slug = f"{song.artist}-{song.title}".replace("/", "-")
        for suffix in self.config.lyrics.allowed_formats:
            candidate = cache_root / f"{slug}{suffix}"
            if candidate.exists():
                sources.append(("cache", candidate))

        feed_root = ensure_directory(self.config.paths.provider_feed_dir)
        for file_name in ("lyrics_feed.json",):
            feed_path = feed_root / file_name
            if feed_path.exists():
                entries = read_json(feed_path, [])
                for entry in entries:
                    if (
                        entry.get("title", "").casefold() == song.title.casefold()
                        and entry.get("artist", "").casefold() == song.artist.casefold()
                        and entry.get("lyrics_path")
                    ):
                        external_path = Path(entry["lyrics_path"])
                        if external_path.exists():
                            sources.append(("json-feed", external_path))
        for remote_path in self._fetch_remote_lyrics(song):
            sources.append(("remote-url", remote_path))
        return sources

    def _fetch_remote_lyrics(self, song: SongAsset) -> list[Path]:
        remote_urls: list[str] = []
        if song.metadata.get("lyrics_url"):
            remote_urls.append(str(song.metadata["lyrics_url"]))
        remote_urls.extend(str(url) for url in song.metadata.get("lyrics_urls", []))
        downloaded: list[Path] = []
        if not remote_urls:
            return downloaded
        cache_root = ensure_directory(self.config.paths.lyrics_cache_dir)
        safe_stem = f"{song.artist}-{song.title}".replace("/", "-")
        for index, url in enumerate(remote_urls):
            suffix = Path(urlparse(url).path).suffix.lower() or ".txt"
            if suffix not in self.config.lyrics.allowed_formats:
                continue
            cache_path = cache_root / f"{safe_stem}-remote-{index}{suffix}"
            if cache_path.exists():
                downloaded.append(cache_path)
                continue
            try:
                with urlopen(url, timeout=8) as response:
                    body = response.read().decode("utf-8")
                cache_path.write_text(body, encoding="utf-8")
                downloaded.append(cache_path)
            except OSError:
                continue
        return downloaded

    def _parse_lyrics_file(self, path: Path, source_name: str) -> LyricsBundle | None:
        suffix = path.suffix.lower()
        if suffix == ".lrc":
            return LyricsBundle(lines=self._parse_lrc(path), source_name=source_name)
        if suffix == ".srt":
            return LyricsBundle(lines=self._parse_srt(path), source_name=source_name)
        if suffix == ".json":
            return LyricsBundle(lines=self._parse_json(path), source_name=source_name)
        if suffix == ".txt":
            return None
        return None

    def _load_untimed_lines(self, song: SongAsset) -> list[str]:
        if song.lyrics_path and song.lyrics_path.exists() and song.lyrics_path.suffix.lower() == ".txt":
            return song.lyrics_path.read_text(encoding="utf-8").splitlines()
        cache_root = ensure_directory(self.config.paths.lyrics_cache_dir)
        untimed_path = cache_root / f"{song.artist}-{song.title}.txt"
        if untimed_path.exists():
            return untimed_path.read_text(encoding="utf-8").splitlines()
        return []

    def _parse_lrc(self, path: Path) -> list[LyricLine]:
        parsed: list[LyricLine] = []
        rows = path.read_text(encoding="utf-8").splitlines()
        for index, row in enumerate(rows):
            match = LRC_PATTERN.match(row.strip())
            if not match:
                continue
            minutes, seconds, millis, text = match.groups()
            start = int(minutes) * 60 + int(seconds) + int((millis or "0").ljust(3, "0")) / 1000
            parsed.append(
                LyricLine(
                    text=text.strip(),
                    start=round(start, 3),
                    end=round(start + 2.5, 3),
                    source_format="lrc",
                )
            )
        for idx, line in enumerate(parsed[:-1]):
            line.end = round(max(parsed[idx + 1].start - 0.08, line.start + 0.25), 3)
        if parsed:
            parsed[-1].end = round(parsed[-1].end + 2.5, 3)
            self._backfill_tokens(parsed)
        return parsed

    def _parse_srt(self, path: Path) -> list[LyricLine]:
        blocks = path.read_text(encoding="utf-8").strip().split("\n\n")
        parsed: list[LyricLine] = []
        for block in blocks:
            rows = [row.strip() for row in block.splitlines() if row.strip()]
            if len(rows) < 2:
                continue
            timecode_row = rows[1] if rows[0].isdigit() and len(rows) >= 2 else rows[0]
            match = SRT_TIMECODE_PATTERN.match(timecode_row)
            if not match:
                continue
            start = self._srt_time_to_seconds(match.groups()[:4])
            end = self._srt_time_to_seconds(match.groups()[4:])
            text_rows = rows[2:] if rows[0].isdigit() else rows[1:]
            parsed.append(
                LyricLine(
                    text=" ".join(text_rows),
                    start=round(start, 3),
                    end=round(end, 3),
                    source_format="srt",
                )
            )
        self._backfill_tokens(parsed)
        return parsed

    def _parse_json(self, path: Path) -> list[LyricLine]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload.get("lines", []) if isinstance(payload, dict) else payload
        parsed: list[LyricLine] = []
        for entry in entries:
            tokens = [
                LyricToken(
                    text=str(token["text"]),
                    start=float(token["start"]),
                    end=float(token["end"]),
                )
                for token in entry.get("tokens", [])
            ]
            parsed.append(
                LyricLine(
                    text=str(entry["text"]),
                    start=float(entry["start"]),
                    end=float(entry["end"]),
                    tokens=tokens,
                    source_format="json",
                )
            )
        if parsed and not any(line.tokens for line in parsed):
            self._backfill_tokens(parsed)
        return parsed

    @staticmethod
    def _srt_time_to_seconds(parts: tuple[str, str, str, str]) -> float:
        hours, minutes, seconds, millis = (int(part) for part in parts)
        return (hours * 3600) + (minutes * 60) + seconds + (millis / 1000)

    @staticmethod
    def _backfill_tokens(lines: list[LyricLine]) -> None:
        for line in lines:
            words = [part for part in line.text.split() if part]
            if not words:
                continue
            duration = max(line.end - line.start, 0.4)
            slice_width = duration / len(words)
            line.tokens = []
            for index, word in enumerate(words):
                start = line.start + (index * slice_width)
                end = line.start + ((index + 1) * slice_width)
                line.tokens.append(
                    LyricToken(
                        text=word,
                        start=round(start, 3),
                        end=round(end, 3),
                    )
                )
