# TikTok Lyric Video Pipeline

An automated, modular pipeline for producing 10 to 15 short TikTok lyric videos per day with minimal manual intervention. The design favors low compute, repeatable outputs, and queue-based execution so rendering and uploading stay decoupled.

## Architecture

The pipeline is organized into stages:

1. `Song intake` pulls from two sources: a manual priority folder and automated trending feeds.
2. `Lyric fetching` resolves timestamped lyrics from public sources in LRC, SRT, or JSON form.
3. `Alignment fallback` maps lyrics onto the audio when timestamps are missing.
4. `SSS segment detection` scores candidate moments and picks 3 to 5 non-overlapping clips per song.
5. `Style selection` chooses lyric display, layout, typography, color, and hook text.
6. `Rendering` produces vertical 1080x1920 MP4 files with subtitle-driven lyric treatment.
7. `Scheduling` writes upload jobs into a queue for the next-day posting window.
8. `Upload` hands queued clips to the TikTok API layer, with Instagram Reels left open for later expansion.

Manual priority always wins. If a user drops audio into the manual folder, that song is processed before any automated queue item, even if the automated feeds already contain trending entries.

## Repository Layout

```text
.
├─ config/
│  └─ pipeline.example.json
├─ data/
│  ├─ automated_queue/
│  ├─ lyrics_cache/
│  ├─ manual_priority/
│  └─ provider_feeds/
├─ output/
│  ├─ render_work/
│  ├─ scheduled_uploads.json
│  └─ videos/
├─ src/
│  └─ tiktok_lyric_pipeline/
└─ pyproject.toml
```

Expected usage:

- Put forced-process audio files in `data/manual_priority/`.
- Drop feed exports or queue inputs into `data/automated_queue/` and `data/provider_feeds/`.
- Write rendered MP4s to `output/videos/`.
- Store scheduled upload jobs in `output/scheduled_uploads.json`.

## Setup

1. Install Python 3.11 or newer.
2. Create and activate a virtual environment.
3. Install the project in editable mode.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .
```

If you render locally, install `ffmpeg` separately and make sure it is on `PATH`.

## Configuration

Use `config/pipeline.example.json` as the starting point. The JSON mirrors the dataclasses in `src/tiktok_lyric_pipeline/config.py`, so the top-level keys are:

- `root_dir`
- `paths`
- `intake`
- `lyrics`
- `alignment`
- `segments`
- `render`
- `schedule`
- `random_seed`

Important behavior:

- `intake.target_videos_min` and `intake.target_videos_max` define the daily production target.
- `intake.automated_feed_files` lists the trending-feed payloads to pull from.
- `lyrics.use_alignment_fallback` enables lightweight lyric-to-audio alignment when timestamped lyrics are unavailable.
- `segments` controls the SSS window length, minimum gap, and how many clips can be chosen per song.
- `schedule.upload_window_start_hour` and `schedule.upload_window_end_hour` define the next-day posting window.

## Scheduling And Queue Output

The system does not upload directly from the renderer. Instead, it exports an upload-ready queue containing the final MP4 path, caption text, hook category, and scheduled publish time.

Typical flow:

1. Render MP4 files into `output/videos/`.
2. Create queue entries in `output/scheduled_uploads.json`.
3. The upload worker reads that queue and posts each clip through the TikTok API.

Posting times are spread across the next day using hour buckets and randomized minutes so uploads do not cluster at the same minute mark.

## Legal And Platform Notes

- Spotify metadata such as charts, audio analysis, and section loudness can be used as reference signals.
- Do not sync Spotify-streamed audio directly into generated videos unless you have the rights and a compliant source file.
- The safest approach is to render from locally owned or licensed audio files only.
- TikTok upload automation should use the official API flow and respect account and content policies.

## Hook Categories

The hook system should always label the category in captions, even when no hook phrase is added on-screen. Good starter categories include:

- late night songs
- songs that hurt
- underrated songs
- soft life songs
- villain mode songs
- healing songs
- main character songs
- throwback feelings
- sad girl songs
- window seat songs

## Notes For Expansion

- The current design keeps layout templates, lyric styles, fonts, and color choices modular so new styles can be added without changing the pipeline core.
- Instagram Reels can be added later by reusing the same render output and scheduling abstraction.

## CLI Usage

Run the pipeline in dry-run mode first:

```powershell
python -m tiktok_lyric_pipeline --config config/pipeline.example.json --dry-run
```

Useful flags:

- `--dry-run` writes subtitle files, render manifests, and upload queue records without invoking ffmpeg.
- `--max-clips 12` overrides the daily clip target for a single run.
- `--force-automated` reruns automated-feed songs even if they already exist in the pipeline state file.

Example normalized provider payloads are included in `data/provider_feeds/*.example.json`.
