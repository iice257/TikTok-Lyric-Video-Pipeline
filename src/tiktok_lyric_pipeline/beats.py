"""Lightweight beat tracking for the "Pulse" lyric style.

ffmpeg decodes the clip's audio to mono PCM; the rest is plain Python: an
energy-based onset envelope, tempo by autocorrelation, then the beat grid
phase that best lines up with the onsets. It is tuned for pop/hip-hop tempos
(70-180 BPM) and only needs to be good enough to pulse lyrics on the beat.
"""

from __future__ import annotations

from array import array
import math
from pathlib import Path
import subprocess

SAMPLE_RATE = 11025
HOP = 128  # ~86 envelope frames per second
MIN_BPM = 70.0
MAX_BPM = 180.0
PREFERRED_BPM = 115.0


def detect_beats(audio_path: Path, start: float, duration: float, ffmpeg_binary: str = "ffmpeg") -> list[float]:
    """Beat times in seconds, relative to `start`. Empty if decoding fails."""
    command = [
        ffmpeg_binary, "-v", "error", "-ss", f"{max(start, 0.0):.3f}", "-t", f"{duration:.3f}",
        "-i", str(audio_path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-",
    ]
    try:
        result = subprocess.run(command, capture_output=True, check=False, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0 or not result.stdout:
        return []
    samples = array("h")
    samples.frombytes(result.stdout[: len(result.stdout) // 2 * 2])
    return beats_from_samples(samples, SAMPLE_RATE)


def onset_envelope(samples, sample_rate: int = SAMPLE_RATE, hop: int = HOP) -> list[float]:
    frames = len(samples) // hop
    log_energy = []
    for index in range(frames):
        chunk = samples[index * hop : (index + 1) * hop]
        energy = sum(value * value for value in chunk) / max(len(chunk), 1)
        log_energy.append(math.log1p(energy))
    # Positive changes in loudness mark note and drum onsets.
    return [0.0] + [max(0.0, log_energy[i] - log_energy[i - 1]) for i in range(1, len(log_energy))]


def beats_from_samples(samples, sample_rate: int = SAMPLE_RATE, hop: int = HOP) -> list[float]:
    envelope = onset_envelope(samples, sample_rate, hop)
    if len(envelope) < 16 or max(envelope) <= 0:
        return []
    frame_rate = sample_rate / hop
    mean = sum(envelope) / len(envelope)
    centered = [value - mean for value in envelope]

    def autocorrelation(lag: int) -> float:
        return sum(centered[i] * centered[i - lag] for i in range(lag, len(centered))) / (len(centered) - lag)

    lags = range(int(frame_rate * 60 / MAX_BPM), min(int(frame_rate * 60 / MIN_BPM) + 1, len(centered) - 1))
    scores = {}
    for lag in lags:
        # Gently prefer common tempos so double/half-time doesn't win on a tie.
        bpm = frame_rate * 60 / lag
        scores[lag] = autocorrelation(lag) * math.exp(-0.5 * (math.log2(bpm / PREFERRED_BPM) / 0.9) ** 2)
    if not scores:
        return []
    best_lag = max(scores, key=scores.get)
    if scores[best_lag] <= 0:
        return []

    # Whole-frame lags are ~1-2% off, which drifts by a beat over a minute; refine to a fractional period.
    period = float(best_lag)
    if best_lag - 1 in scores and best_lag + 1 in scores:
        left, mid, right = autocorrelation(best_lag - 1), autocorrelation(best_lag), autocorrelation(best_lag + 1)
        denominator = left - 2 * mid + right
        if denominator < 0:
            period += 0.5 * (left - right) / denominator

    # Pick the phase from the opening seconds only: over a whole minute a tiny tempo error smears the score.
    horizon = min(len(envelope), int(8 * frame_rate))

    def grid(phase: float) -> list[int]:
        count = int((horizon - phase) / period) + 1
        return [round(phase + k * period) for k in range(count) if round(phase + k * period) < horizon]

    phases = [step / 4 for step in range(int(period * 4))]
    best_phase = max(phases, key=lambda phase: sum(envelope[frame] for frame in grid(phase)))

    # Track forward from the best phase: predict each beat from the previous one and pull it to the
    # strongest nearby onset, so a slightly-off tempo estimate can't accumulate drift.
    window = max(1, round(0.12 * period))
    beats = []
    position = best_phase
    while position < len(envelope):
        center = round(position)
        lo, hi = max(0, center - window), min(len(envelope), center + window + 1)
        snapped = max(range(lo, hi), key=lambda frame: envelope[frame] * math.exp(-0.5 * ((frame - position) / window) ** 2))
        if envelope[snapped] <= 0:
            snapped = center  # quiet stretch: keep the grid steady
        beats.append(round(snapped * hop / sample_rate, 3))
        position = snapped + period
    return beats
