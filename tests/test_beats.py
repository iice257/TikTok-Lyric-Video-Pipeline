from __future__ import annotations

from array import array
import math
from pathlib import Path
import random

import pytest

from tiktok_lyric_pipeline.beats import SAMPLE_RATE, beats_from_samples
from tiktok_lyric_pipeline.config import PipelineConfig
from tiktok_lyric_pipeline.stages.rendering import RenderPlanner

REPO_ROOT = Path(__file__).resolve().parents[1]


def click_track(bpm: float, seconds: float, offset: float) -> tuple[array, list[float]]:
    """Kick drum on every beat over a steady tone and noise."""
    rng = random.Random(1)
    period = 60 / bpm
    samples = array("h", [0] * int(SAMPLE_RATE * seconds))
    for index in range(len(samples)):
        t = index / SAMPLE_RATE
        kick = 0.0
        if t >= offset:
            phase = (t - offset) % period
            kick = math.exp(-phase * 30) * math.sin(2 * math.pi * 60 * phase) * 12000
        value = kick + 3000 * math.sin(2 * math.pi * 220 * t) + rng.uniform(-800, 800)
        samples[index] = int(max(-32767, min(32767, value)))
    truth = [offset + k * period for k in range(int((seconds - offset) / period) + 1)]
    return samples, truth


@pytest.mark.parametrize("bpm", [80, 128, 174])
def test_beats_land_on_the_kick(bpm) -> None:
    samples, truth = click_track(bpm, seconds=16, offset=0.21)
    beats = beats_from_samples(samples)
    assert abs(len(beats) - len(truth)) <= 1
    assert max(min(abs(beat - true) for true in truth) for beat in beats) < 0.03


def test_silence_has_no_beats() -> None:
    assert beats_from_samples(array("h", [0] * SAMPLE_RATE * 4)) == []


def test_pulse_tags_scale_on_each_beat_inside_the_line() -> None:
    planner = RenderPlanner(PipelineConfig.default(REPO_ROOT))
    tags = planner.pulse_tags(2.0, 4.0, [1.5, 2.25, 3.0, 4.5])
    assert r"\t(250,340,\fscx112\fscy112)" in tags
    assert r"\t(1000,1090,\fscx112\fscy112)" in tags
    assert tags.count(r"\fscx112") == 2  # beats outside the line are ignored


def test_pulse_tags_fall_back_to_a_single_pop_without_beats() -> None:
    planner = RenderPlanner(PipelineConfig.default(REPO_ROOT))
    assert planner.pulse_tags(0.0, 3.0, []) == r"{\t(0,250,\fscx115\fscy115)}"
