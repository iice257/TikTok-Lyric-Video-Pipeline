from __future__ import annotations

from ..config import AlignmentConfig
from ..models import AudioSection, LyricLine, LyricToken
from ..utils import clamp


class LightweightLyricAligner:
    """
    A low-compute fallback aligner that assigns line and word timings
    using lyric density plus optional audio-section anchors.
    """

    def __init__(self, config: AlignmentConfig) -> None:
        self.config = config

    def align(
        self,
        untimed_lines: list[str],
        *,
        duration_seconds: float | None,
        sections: list[AudioSection] | None = None,
    ) -> list[LyricLine]:
        cleaned = [line.strip() for line in untimed_lines if line.strip()]
        if not cleaned:
            return []
        total_duration = max(duration_seconds or 0.0, 1.0)
        anchor_windows = self._build_anchor_windows(total_duration, sections or [], len(cleaned))
        weighted_lengths = [max(len(line.replace(" ", "")), 4) for line in cleaned]
        total_weight = float(sum(weighted_lengths))
        cursor = self.config.lead_in_seconds
        lines: list[LyricLine] = []

        for idx, text in enumerate(cleaned):
            window_start, window_end = anchor_windows[idx]
            proportional = (weighted_lengths[idx] / total_weight) * total_duration
            estimated = clamp(
                proportional,
                self.config.min_line_duration,
                self.config.max_line_duration,
            )
            start = max(cursor, window_start)
            end = min(start + estimated, window_end)
            if idx == len(cleaned) - 1:
                end = max(end, total_duration - self.config.lead_out_seconds)
            tokens = self._tokenize_line(text, start, end)
            lines.append(
                LyricLine(
                    text=text,
                    start=round(start, 3),
                    end=round(max(end, start + 0.4), 3),
                    tokens=tokens,
                    source_format="aligned",
                )
            )
            cursor = max(end, start + 0.4)
        return self._repair_overlaps(lines)

    def _build_anchor_windows(
        self,
        duration_seconds: float,
        sections: list[AudioSection],
        line_count: int,
    ) -> list[tuple[float, float]]:
        if not sections:
            return [(0.0, duration_seconds) for _ in range(line_count)]
        windows: list[tuple[float, float]] = []
        for section in sections:
            section_start = max(section.start, 0.0)
            section_end = min(section.end, duration_seconds)
            repeat_count = max(1, int(round(section.duration / 8.0)))
            windows.extend([(section_start, section_end)] * repeat_count)
        if not windows:
            windows = [(0.0, duration_seconds)]
        while len(windows) < line_count:
            windows.extend(windows)
        return windows[:line_count]

    def _tokenize_line(self, text: str, start: float, end: float) -> list[LyricToken]:
        words = [part for part in text.split() if part]
        if not words:
            return []
        duration = max(end - start, 0.4)
        total_chars = sum(max(len(word), 1) for word in words)
        cursor = start
        tokens: list[LyricToken] = []
        for word in words:
            ratio = max(len(word), 1) / total_chars
            token_duration = max(duration * ratio, 0.08)
            token_end = min(cursor + token_duration, end)
            tokens.append(LyricToken(text=word, start=round(cursor, 3), end=round(token_end, 3)))
            cursor = token_end
        if tokens:
            tokens[-1].end = round(end, 3)
        return tokens

    @staticmethod
    def _repair_overlaps(lines: list[LyricLine]) -> list[LyricLine]:
        previous_end = 0.0
        for line in lines:
            if line.start < previous_end:
                shift = previous_end - line.start
                line.start = round(previous_end, 3)
                line.end = round(max(line.end + shift, line.start + 0.4), 3)
                for token in line.tokens:
                    token.start = round(token.start + shift, 3)
                    token.end = round(token.end + shift, 3)
            previous_end = line.end
        return lines
