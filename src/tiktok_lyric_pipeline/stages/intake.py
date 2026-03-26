from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..config import PipelineConfig
from ..models import AudioSection, SongAsset
from ..utils import ensure_directory, read_json, slugify, stable_id


@dataclass(slots=True)
class IntakeBatch:
    manual_songs: list[SongAsset]
    automated_songs: list[SongAsset]

    @property
    def ordered_songs(self) -> list[SongAsset]:
        return [*self.manual_songs, *self.automated_songs]


class SongIntakeService:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config

    def pull_batch(self) -> IntakeBatch:
        manual = self._load_manual_priority_songs()
        automated = self._load_automated_queue()
        return IntakeBatch(manual_songs=manual, automated_songs=automated)

    def _load_manual_priority_songs(self) -> list[SongAsset]:
        root = ensure_directory(self.config.paths.manual_priority_dir)
        audio_paths = sorted(
            path for path in root.iterdir()
            if path.is_file() and path.suffix.lower() in self.config.intake.manual_extensions
        )
        songs: list[SongAsset] = []
        for audio_path in audio_paths:
            stat = audio_path.stat()
            manual_fingerprint = f"{audio_path.stem}:{stat.st_size}:{stat.st_mtime_ns}"
            songs.append(
                SongAsset(
                    song_id=stable_id("manual", manual_fingerprint),
                    title=self._extract_title(audio_path.stem),
                    artist=self._extract_artist(audio_path.stem),
                    audio_path=audio_path,
                    source="manual_priority",
                    album_cover_path=self._find_cover_asset(audio_path),
                    manual_priority=True,
                    lyrics_path=self._find_lyrics_asset(audio_path),
                    duration_seconds=None,
                    metadata={
                        "manual_fingerprint": manual_fingerprint,
                        "manual_audio_path": str(audio_path),
                    },
                )
            )
        return songs

    def _load_automated_queue(self) -> list[SongAsset]:
        feed_root = ensure_directory(self.config.paths.provider_feed_dir)
        songs: list[SongAsset] = []
        seen_audio_ids: set[str] = set()
        for file_name in self.config.intake.automated_feed_files:
            feed_path = feed_root / file_name
            source_name = feed_path.stem
            entries = read_json(feed_path, [])
            for entry in entries:
                song = self._song_from_feed_entry(entry, source_name)
                if song.song_id in seen_audio_ids:
                    continue
                seen_audio_ids.add(song.song_id)
                songs.append(song)
        songs.sort(
            key=lambda song: (
                int(song.metadata.get("chart_rank", 9999)),
                -float(song.metadata.get("trend_score", 0.0)),
                song.title.lower(),
            )
        )
        return songs

    def _song_from_feed_entry(self, entry: dict, source_name: str) -> SongAsset:
        title = entry.get("title", "Unknown Title")
        artist = entry.get("artist", "Unknown Artist")
        audio_path = Path(entry["audio_path"]) if entry.get("audio_path") else Path("__missing_audio__")
        album_cover_path = Path(entry["album_cover_path"]) if entry.get("album_cover_path") else None
        lyrics_path = Path(entry["lyrics_path"]) if entry.get("lyrics_path") else None
        song_id = entry.get("song_id") or stable_id(source_name, title, artist)
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
            for section in entry.get("sections", [])
        ]
        metadata = dict(entry)
        return SongAsset(
            song_id=song_id,
            title=title,
            artist=artist,
            audio_path=audio_path,
            source=source_name,
            album_cover_path=album_cover_path,
            manual_priority=False,
            spotify_track_id=entry.get("spotify_track_id"),
            tiktok_audio_id=entry.get("tiktok_audio_id"),
            lyrics_path=lyrics_path,
            duration_seconds=float(entry["duration_seconds"]) if entry.get("duration_seconds") else None,
            audio_features=entry.get("audio_features", {}),
            sections=sections,
            metadata=metadata,
        )

    @staticmethod
    def _extract_artist(stem: str) -> str:
        if " - " in stem:
            return stem.split(" - ", 1)[0].strip()
        return "Unknown Artist"

    @staticmethod
    def _extract_title(stem: str) -> str:
        if " - " in stem:
            return stem.split(" - ", 1)[1].strip()
        return stem.replace("_", " ").strip()

    @staticmethod
    def _find_cover_asset(audio_path: Path) -> Path | None:
        for suffix in (".jpg", ".jpeg", ".png", ".webp"):
            candidate = audio_path.with_suffix(suffix)
            if candidate.exists():
                return candidate
        return None

    @staticmethod
    def _find_lyrics_asset(audio_path: Path) -> Path | None:
        for suffix in (".lrc", ".srt", ".json", ".txt"):
            candidate = audio_path.with_suffix(suffix)
            if candidate.exists():
                return candidate
        return None
