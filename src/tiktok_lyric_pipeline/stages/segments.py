from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

from ..config import SegmentConfig
from ..models import LyricLine, SegmentCandidate, SegmentSelection, SongAsset
from ..utils import clamp, normalize, stable_id

NORMALIZE_PATTERN = re.compile(r"[^a-z0-9\s]")


class SongSegmentSystem:
    def __init__(self, config: SegmentConfig) -> None:
        self.config = config

    def select_segments(self, song: SongAsset, lines: list[LyricLine]) -> list[SegmentSelection]:
        if not lines:
            return []
        candidates = self._build_candidates(song, lines)
        selected = self._select_non_overlapping(candidates)
        return [
            SegmentSelection(
                segment_id=stable_id(song.song_id, f"{candidate.start:.2f}", f"{candidate.end:.2f}"),
                song_id=song.song_id,
                start=round(candidate.start, 3),
                end=round(candidate.end, 3),
                score=round(candidate.score, 4),
                reason=candidate.reason,
                caption_seed=candidate.repeated_phrase or lines[0].text,
            )
            for candidate in selected
        ]

    def _build_candidates(self, song: SongAsset, lines: list[LyricLine]) -> list[SegmentCandidate]:
        fingerprints = [self._normalize_text(line.text) for line in lines]
        frequency = Counter(fingerprint for fingerprint in fingerprints if fingerprint)
        phrase_windows = self._find_repeated_phrase_windows(lines, fingerprints, frequency)
        if not phrase_windows:
            phrase_windows = [(idx, None) for idx in range(0, len(lines), max(1, self.config.chorus_window_lines))]

        loudness_values = [section.loudness for section in song.sections if section.loudness is not None]
        loudness_low = min(loudness_values) if loudness_values else -18.0
        loudness_high = max(loudness_values) if loudness_values else -3.0

        candidates: list[SegmentCandidate] = []
        for anchor_index, repeated_phrase in phrase_windows:
            candidate = self._candidate_from_anchor(
                song,
                lines,
                anchor_index=anchor_index,
                repeated_phrase=repeated_phrase,
                loudness_low=loudness_low,
                loudness_high=loudness_high,
                repetition_count=frequency.get(fingerprints[anchor_index], 1),
            )
            if candidate:
                candidates.append(candidate)
        candidates.sort(key=lambda item: item.score, reverse=True)
        return candidates

    def _candidate_from_anchor(
        self,
        song: SongAsset,
        lines: list[LyricLine],
        *,
        anchor_index: int,
        repeated_phrase: str | None,
        loudness_low: float,
        loudness_high: float,
        repetition_count: int,
    ) -> SegmentCandidate | None:
        anchor = lines[anchor_index]
        target = self.config.target_duration_seconds
        start = max(anchor.start - (target * 0.2), 0.0)
        end = start + target
        while end - start < self.config.min_duration_seconds and anchor_index + 1 < len(lines):
            end = min(lines[min(anchor_index + self.config.chorus_window_lines, len(lines) - 1)].end + 4.0, start + target)
        song_duration = song.duration_seconds or (lines[-1].end + 1.0)
        end = min(end, song_duration)
        if end - start < self.config.min_duration_seconds:
            end = min(start + self.config.min_duration_seconds, song_duration)
        if end - start > self.config.max_duration_seconds:
            end = start + self.config.max_duration_seconds
        if end - start < self.config.min_duration_seconds:
            return None

        section_scores = []
        danceability = float(song.audio_features.get("danceability", 0.5))
        energy = float(song.audio_features.get("energy", 0.5))
        speechiness = float(song.audio_features.get("speechiness", 0.2))
        slowness = 1.0 - float(song.audio_features.get("tempo_norm", 0.5))
        for section in song.sections:
            if section.start >= end or section.end <= start:
                continue
            loudness_value = section.loudness if section.loudness is not None else loudness_low
            loudness_score = normalize(loudness_value, loudness_low, loudness_high)
            section_scores.append(
                (loudness_score * 0.6)
                + (float(section.danceability or danceability) * 0.2)
                + (float(section.energy or energy) * 0.2)
            )
        loudness_score = sum(section_scores) / len(section_scores) if section_scores else 0.4
        repetition_score = clamp((repetition_count - 1) / 4, 0.0, 1.0)
        musicality_score = clamp((danceability * 0.5) + (energy * 0.3) + (slowness * 0.2) - (speechiness * 0.15), 0.0, 1.0)
        duration_penalty = abs((end - start) - self.config.target_duration_seconds) / self.config.target_duration_seconds
        score = (
            (repetition_score * 0.45)
            + (loudness_score * 0.3)
            + (musicality_score * 0.2)
            + ((1.0 - duration_penalty) * 0.05)
        )
        phrase_label = repeated_phrase or anchor.text
        return SegmentCandidate(
            start=round(start, 3),
            end=round(end, 3),
            score=round(score, 4),
            reason=f"repetition={repetition_score:.2f}, loudness={loudness_score:.2f}, musicality={musicality_score:.2f}",
            repeated_phrase=phrase_label,
            loudness_score=round(loudness_score, 3),
            repetition_score=round(repetition_score, 3),
            musicality_score=round(musicality_score, 3),
        )

    def _select_non_overlapping(self, candidates: list[SegmentCandidate]) -> list[SegmentCandidate]:
        selected: list[SegmentCandidate] = []
        for candidate in candidates:
            if any(self._overlaps(candidate, existing) for existing in selected):
                continue
            selected.append(candidate)
            if len(selected) >= self.config.max_segments_per_song:
                break
        if len(selected) < self.config.min_segments_per_song:
            for candidate in candidates:
                if candidate in selected:
                    continue
                if any(self._overlaps(candidate, existing, strict=False) for existing in selected):
                    continue
                selected.append(candidate)
                if len(selected) >= self.config.min_segments_per_song:
                    break
        return sorted(selected, key=lambda item: item.start)

    def _find_repeated_phrase_windows(
        self,
        lines: list[LyricLine],
        fingerprints: list[str],
        frequency: Counter[str],
    ) -> list[tuple[int, str | None]]:
        windows: list[tuple[int, str | None]] = []
        seen: set[str] = set()
        for index, fingerprint in enumerate(fingerprints):
            if not fingerprint or frequency[fingerprint] < 2 or fingerprint in seen:
                continue
            seen.add(fingerprint)
            windows.append((index, lines[index].text))
        return windows

    def _normalize_text(self, text: str) -> str:
        lowered = NORMALIZE_PATTERN.sub("", text.casefold())
        lowered = " ".join(lowered.split())
        return lowered

    def _overlaps(self, left: SegmentCandidate, right: SegmentCandidate, strict: bool = True) -> bool:
        padding = self.config.min_gap_seconds if strict else self.config.min_gap_seconds / 2
        return not ((left.end + padding) <= right.start or (right.end + padding) <= left.start)
