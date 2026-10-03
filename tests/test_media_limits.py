from __future__ import annotations

from types import SimpleNamespace

import httpx

from tiktok_lyric_pipeline.stages.rendering import double_bitrate
from tiktok_platform import tiktok_api
from tiktok_platform.tiktok_api import MAX_SINGLE_CHUNK_BYTES, UPLOAD_CHUNK_BYTES, TikTokApiClient, chunk_plan

MB = 1024 * 1024


def test_double_bitrate() -> None:
    assert double_bitrate("8M") == "16M"
    assert double_bitrate("4500k") == "9000k"
    assert double_bitrate("2.5M") == "5M"


def test_chunk_plan_single_chunk_up_to_limit() -> None:
    assert chunk_plan(3 * MB) == (3 * MB, 1)
    assert chunk_plan(MAX_SINGLE_CHUNK_BYTES) == (MAX_SINGLE_CHUNK_BYTES, 1)


def test_chunk_plan_splits_large_files_with_remainder_in_last_chunk() -> None:
    size = 350 * MB + 123
    chunk_size, count = chunk_plan(size)
    assert chunk_size == UPLOAD_CHUNK_BYTES
    assert count == size // UPLOAD_CHUNK_BYTES
    last_chunk = size - chunk_size * (count - 1)
    assert chunk_size <= last_chunk < 2 * chunk_size


def test_upload_file_sends_contiguous_ranges(tmp_path, monkeypatch) -> None:
    size = 70 * MB + 7
    video = tmp_path / "clip.mp4"
    with video.open("wb") as handle:
        handle.truncate(size)
    calls: list[tuple[str, int]] = []

    def fake_put(url, *, content, headers, timeout):
        calls.append((headers["Content-Range"], len(content)))
        return httpx.Response(201)

    monkeypatch.setattr(tiktok_api.httpx, "put", fake_put)
    TikTokApiClient(SimpleNamespace()).upload_file("https://upload.example", video)

    _, count = chunk_plan(size)
    assert len(calls) == count
    expected_start = 0
    for content_range, length in calls:
        span, total = content_range.removeprefix("bytes ").split("/")
        start, end = (int(part) for part in span.split("-"))
        assert int(total) == size
        assert start == expected_start
        assert end - start + 1 == length
        expected_start = end + 1
    assert expected_start == size
