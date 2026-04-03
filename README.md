# TikTok Lyric Video Pipeline

An automated Python pipeline for generating 10 to 15 TikTok-ready lyric videos per day from licensed audio, timed lyrics, and trend metadata. The project is built around modular stages so intake, lyrics, segment scoring, rendering, scheduling, and upload can evolve independently.

## Platform Architecture

The repository now contains two layers:

- `src/tiktok_lyric_pipeline`: the original media engine for lyrics, segments, rendering, and scheduling
- `src/tiktok_platform_api` + `src/tiktok_platform_worker` + `apps/web`: the control plane, always-on worker, and mobile-first admin panel

Target deployment split:

- `apps/web` on Vercel
- FastAPI API + worker + ffmpeg on one always-on Linux host
- Postgres as the system of record
- persistent media storage mounted on the backend host

Production rules:

- production audio must be licensed/local or otherwise explicitly approved
- Spotify is metadata/trend input only in production
- lab-mode items can render/analyze but must not publish

## What It Does

- Prioritizes `data/manual_priority/` over automated trend feeds every run.
- Pulls metadata from normalized Spotify and TikTok feed exports.
- Resolves timed lyrics from LRC, SRT, or JSON, then falls back to lightweight alignment for plain text.
- Uses the Song Segment System (SSS) to choose 3 to 5 non-overlapping clips per song.
- Randomizes lyric style, video layout, fonts, highlight color, and optional hook text using the requested weighting rules.
- Plans or renders 1080x1920 MP4 outputs and writes upload jobs for next-day posting.

## Repository Layout

```text
.
|-- apps/
|   `-- web/
|-- config/
|   `-- pipeline.example.json
|-- data/
|   |-- automated_queue/
|   |-- lyrics_cache/
|   |-- manual_priority/
|   `-- provider_feeds/
|-- docker/
|   `-- platform.Dockerfile
|-- output/
|   |-- render_work/
|   `-- videos/
|-- src/
|   |-- tiktok_lyric_pipeline/
|   |-- tiktok_platform/
|   |-- tiktok_platform_api/
|   `-- tiktok_platform_worker/
|-- tests/
|-- docker-compose.yml
|-- pyproject.toml
`-- run_pipeline.py
```

## Quick Start

### Full Stack Local Start

1. Copy `.env.example` to `.env`
2. Copy `apps/web/.env.example` to `apps/web/.env.local`
3. Install Python dependencies
4. Install frontend dependencies
5. Start the API
6. Start the worker
7. Start the web app

Commands:

```powershell
python -m pip install -e .
cd apps/web
npm install
cd ../..
python -m tiktok_platform_api.app
python -m tiktok_platform_worker.main --poll-interval-seconds 20
cd apps/web
npm run dev
```

Recommended local defaults:

- backend `.env`: keep `APP_ENV=dev`, `COOKIE_SECURE=false`, `COOKIE_SAME_SITE=lax`, `TIKTOK_SIMULATE_UPLOADS=true`
- frontend `apps/web/.env.local`: set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

Production split for Vercel + backend host:

- backend `.env`: set `APP_ENV=prod`, `DATABASE_URL` to Postgres, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`, and real admin/TikTok secrets
- Vercel env: set `NEXT_PUBLIC_API_BASE_URL` to the public HTTPS backend API URL
- ensure the backend `FRONTEND_BASE_URL` exactly matches the Vercel app origin
- the web UI is the main operator surface once deployed: manual intake, queue actions, clip edits, alerts, and pipeline pause/resume all run through the browser
- media previews and artifact downloads are exposed through authenticated backend `/media` access, so remote devices do not need shell access to the host filesystem

### Docker Local Start

```powershell
copy .env.example .env
docker compose up --build
```

The API will be available on `http://localhost:8000` and the web app can point to it with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.

### Option A: Run Without Installing The Package

This is the simplest path on Windows and works directly from the repo root:

```powershell
python run_pipeline.py --config config/pipeline.example.json --dry-run
```

For continuous operation:

```powershell
python run_pipeline.py --config config/pipeline.example.json --watch --poll-interval-seconds 60
```

### Option B: Install In A Virtual Environment

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -e .
python -m tiktok_lyric_pipeline --config config/pipeline.example.json --dry-run
```

If you want actual MP4 rendering, install `ffmpeg` and make sure it is on `PATH`.

## Common Windows Gotcha

If you see a `>>>` prompt, you are inside the Python REPL. Shell commands such as `python -m ...` will fail there with `SyntaxError`.

Exit the REPL first:

```text
exit()
```

Then run the command from PowerShell or Command Prompt.

## Why A Dry Run May Return Zero Clips

The repository ships with placeholder feed examples and empty runtime folders. A successful dry run with zero clips usually means the app started correctly, but there were no real input songs to process yet.

To get actual planned clips:

1. Put licensed audio files in `data/manual_priority/` for immediate processing.
2. Or create real `spotify_trending.json` and `tiktok_trending.json` files in `data/provider_feeds/`.
3. Add matching lyric sources through sidecar files, cached lyric files, or lyric URLs in the feed payload.

## First Video Tutorial

This is the fastest path to the first actual MP4:

1. Put a licensed audio file in `data/manual_priority/`.
2. Name it `Artist Name - Song Title.mp3` so artist and title are inferred correctly.
3. Put a matching sidecar lyrics file beside it with the same base name:
   `Artist Name - Song Title.lrc`
4. Optionally add cover art beside it with the same base name:
   `Artist Name - Song Title.jpg`
5. Run a dry-run first to confirm the clip is discovered:

```powershell
python run_pipeline.py --config config/pipeline.example.json --dry-run --max-clips 1
```

6. If the dry-run shows `produced_clip_count: 1`, run the real render:

```powershell
python run_pipeline.py --config config/pipeline.example.json --max-clips 1
```

7. Check these outputs:
   `output/videos/` for the rendered MP4
   `output/render_work/` for `.ass` subtitles and render manifests
   `output/scheduled_uploads.json` for the upload queue record

Minimal LRC example:

```text
[00:00.00]first line here
[00:08.00]second line here
[00:16.00]repeatable chorus line
[00:24.00]repeatable chorus line
```

If you only have plain untimed lyrics, use `.txt` instead of `.lrc`. The pipeline will use lightweight alignment as a fallback.

## Input Expectations

### Manual Priority

- Drop audio files into `data/manual_priority/`.
- Supported extensions default to `.mp3`, `.wav`, `.m4a`, and `.flac`.
- Manual songs always run before automated songs.

### Automated Feeds

- The default config expects `data/provider_feeds/spotify_trending.json`.
- The default config expects `data/provider_feeds/tiktok_trending.json`.
- Example payload shapes live in `data/provider_feeds/*.example.json`.

Each song record can include:

- `song_id`, `title`, `artist`
- `audio_path`, `album_cover_path`
- `lyrics_url` or `lyrics_urls`
- `duration_seconds`
- trend scores, audio features, and section metadata

## Pipeline Stages

1. Song intake merges manual and automated sources, with manual priority first.
2. Lyrics resolution loads LRC, SRT, JSON, or text sources.
3. Alignment fallback estimates timings when only untimed lyrics exist.
4. SSS segment detection scores chorus-like and high-energy moments while avoiding overlap.
5. Style selection applies lyric, layout, typography, color, and hook distributions.
6. Render planning writes subtitle and manifest artifacts before optional ffmpeg rendering.
7. Scheduling spreads uploads across the next day using randomized minute offsets.
8. Queue export writes upload-ready JSON and NDJSON records.

## Hook Categories

Starter categories included in the design:

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

## Key Config Areas

`config/pipeline.example.json` maps directly to the dataclasses in `src/tiktok_lyric_pipeline/config.py`.

The most useful sections to tweak first are:

- `intake` for daily clip targets and automated feed filenames
- `lyrics` for source order and alignment fallback
- `segments` for clip length, gap rules, and per-song segment count
- `render` for codec, canvas size, grain, and default font families
- `schedule` for upload windows and posting buckets

## Output Files

- Planned or rendered videos go to `output/videos/`
- Render manifests and subtitle assets go to `output/render_work/`
- Upload queue files go to `output/scheduled_uploads.json` and `output/scheduled_uploads.ndjson`
- Run summaries go to `output/run_summary.json`

## Continuous Operation

`--watch` keeps the generation loop running until interrupted with `Ctrl+C`.

Behavior in watch mode:

- polls the manual and automated inputs every cycle
- processes manual files first
- skips already processed inputs unless the file identity changes
- appends new scheduled jobs into the queue instead of overwriting previous ones

Example:

```powershell
python run_pipeline.py --config config/pipeline.example.json --watch --poll-interval-seconds 120
```

## Notes

- Spotify metadata can inform ranking, but the renderer should use only licensed or locally owned audio.
- TikTok upload automation should go through the official API and comply with platform policy.
- Instagram Reels support can be added later by reusing the same render and scheduling outputs.
- This repository now includes the always-on control plane, mobile-first admin web app, DB-backed worker loops, and a simulated upload adapter for end-to-end local testing.
- Real production posting still requires TikTok app approval, real credentials, and completion of the non-simulated upload adapter branch.
