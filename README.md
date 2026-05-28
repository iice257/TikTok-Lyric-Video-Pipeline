# SSS - TikTok Lyric Video Platform

SSS is a backend-heavy media automation project for turning licensed songs, timed lyrics, and trend metadata into short-form lyric videos. It started as a local Python pipeline, then grew into a small control plane with a REST API, database-backed jobs, a worker loop, TikTok upload integration, and a Next.js admin UI.

The core backend is FastAPI + SQLAlchemy, with a small Nest.js companion API now added for read/search resources. It does not currently run Elasticsearch. For backend roles, I treat this repo as proof that I can model a product workflow, design API boundaries, process media asynchronously, and make practical tradeoffs around security, jobs, deployment, and operator tooling.

## Current Stack

- Backend API: Python, FastAPI, Pydantic request models, SQLAlchemy ORM
- Companion API: TypeScript/Nest.js read/search service scaffold in `apps/api-nest`
- Database: SQLite for local development, Postgres-ready via `DATABASE_URL` and Docker Compose
- Migrations: Alembic baseline migration for the platform schema
- Worker: long-running Python process with leases, retries, heartbeats, and job reconciliation
- Media pipeline: lyrics parsing, lightweight alignment fallback, segment scoring, ASS subtitle generation, ffmpeg rendering
- Frontend: Next.js 15, React 19, Tailwind, shadcn-style components
- Deployment: Docker, Render blueprint, Linux/systemd deployment notes, Vercel-ready frontend
- Tests: pytest coverage for API smoke paths, security helpers, worker retry/status behavior

## What It Does

- Ingests songs from manual uploads or normalized provider feed exports.
- Tracks rights status and environment so lab/test material cannot publish by accident.
- Resolves lyrics from LRC, SRT, JSON, cached files, sidecars, remote URLs, or plain text fallback alignment.
- Scores repeated lyric moments and audio-section metadata to pick non-overlapping 30 to 60 second clips.
- Generates subtitle/render manifests and optionally renders vertical MP4s through ffmpeg.
- Schedules upload jobs, handles TikTok OAuth, supports direct/draft upload modes, and polls publish status.
- Gives an operator a web UI for intake, queue review, clip edits, alerts, logs, settings, and pipeline pause/resume.

## Architecture

```text
Manual upload / feed files
          |
          v
FastAPI control plane ---- Next.js admin UI
          |
          v
SQLAlchemy models: songs, lyrics artifacts, segment candidates, clips, render jobs, upload jobs, alerts, state events
          |
          v
Platform worker
          |
          +--> lyrics resolution and fallback alignment
          +--> segment scoring and clip creation
          +--> render planning and ffmpeg execution
          +--> upload scheduling and TikTok API polling
          +--> alerts, heartbeats, retries, audit trail
```

More detail lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Backend Surfaces

The REST API is intentionally simple and operator-focused:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /dashboard/summary`, `GET /dashboard/health`
- `GET /search?q=...`
- `POST /manual-intake`
- `GET /songs`, `GET /songs/{song_id}`
- `GET /clips`, `GET /clips/{clip_id}`, `PATCH /clips/{clip_id}`
- `POST /clips/{clip_id}/rerender`
- `GET /jobs`, `POST /jobs/{job_id}/retry`, `/cancel`, `/quarantine`
- `GET /upload-jobs`, `POST /upload-jobs/{job_id}/approve`, `/reschedule`, `/force-publish`
- `GET /integrations/tiktok/status`, `POST /integrations/tiktok/connect`, `/disconnect`
- `GET /alerts`, `POST /alerts/{alert_id}/ack`
- `GET /workers`
- `GET /media?path=...` for authenticated access to managed media files

Example manual intake:

```bash
curl -X POST http://localhost:8000/manual-intake \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -b "platform_session=$SESSION_COOKIE" \
  -F "title=Song Title" \
  -F "artist=Artist Name" \
  -F "environment=prod" \
  -F "rights_status=licensed" \
  -F "audio=@./data/manual_priority/Artist Name - Song Title.mp3" \
  -F "lyrics=@./data/manual_priority/Artist Name - Song Title.lrc"
```

## Data Model

The control plane stores enough metadata to explain what happened to a clip:

- `songs`: identity, provider/manual source, rights status, environment, audio/cover/lyrics paths, publish eligibility
- `song_inputs`: original intake payloads and source files
- `lyrics_artifacts`: parsed lyric lines, token timing, confidence, source format
- `segment_candidates`: selected and rejected clip windows with scores and reasons
- `clips`: render style, caption, review state, generated artifact paths, scheduled publish time
- `render_jobs` and `upload_jobs`: queue state, idempotency keys, attempts, leases, platform response payloads
- `state_events`: append-only state transitions for traceability
- `alerts`, `worker_heartbeats`, `operator_actions`: operational visibility and audit trail
- `users`, `sessions`, `oauth_tokens`, `app_settings`: auth, integration state, and runtime settings

## Security And Maintainability Notes

- Sessions are HTTP-only cookies; mutation endpoints require CSRF tokens.
- Passwords are hashed with PBKDF2 and constant-time verification.
- OAuth tokens are encrypted at rest when `TOKEN_ENCRYPTION_KEY` is configured. Production requires a valid Fernet key.
- Production startup refuses weak session secrets, missing token encryption keys, SQLite database URLs, missing admin password hashes, insecure cookies, and simulated uploads.
- Media downloads resolve only inside managed storage/data/output roots.
- Manual intake hashes uploaded audio for deduplication and validates supported audio, cover, and lyric file extensions.
- Worker jobs use idempotency keys, leases, retry states, and explicit state events instead of fire-and-forget side effects.

## Local Setup

Requirements:

- Python 3.11+
- Node.js for the web app
- ffmpeg if you want actual MP4 rendering
- Docker if you want the Postgres-backed local stack

Backend:

```powershell
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
python -m pip install -e .
python -m tiktok_platform_api.app
```

Set `API_PORT=18080` if the default `8000` is blocked by Windows policy.

Generate a production token encryption key with:

```powershell
python -c "from tiktok_platform.token_crypto import generate_token_encryption_key; print(generate_token_encryption_key())"
```

Worker:

```powershell
python -m tiktok_platform_worker.main --poll-interval-seconds 20
```

Frontend:

```powershell
cd apps/web
copy .env.example .env.local
npm install
npm run dev
```

No-Docker all-process start:

```powershell
.\scripts\dev-no-docker.ps1
```

If `node` is not on `PATH`, pass a known Node executable:

```powershell
.\scripts\dev-no-docker.ps1 -NodeExe "C:\path\to\node.exe"
```

If local Node cannot spawn child processes, use the no-build smoke UI for browser verification:

```powershell
python -m http.server 3000 --directory apps/smoke-ui
```

If port `3000` or `8000` is blocked, run the backend/frontend on higher ports and open the smoke UI with `?api=http://localhost:<api-port>`.

Default local credentials are created only in development when `ADMIN_PASSWORD_HASH` is empty:

- email: `admin@example.com`
- password: `admin123`

## Docker Local Stack

```powershell
copy .env.example .env
docker compose up --build
```

This starts Postgres, the FastAPI API, and the worker. The web app can point to `http://localhost:8000` through `NEXT_PUBLIC_API_BASE_URL`.

Docker is useful for matching the Postgres-backed deployment shape, but it is not required to run the API, worker, and web app locally.

## Pipeline-Only Mode

The original pipeline can still run without the platform API:

```powershell
python run_pipeline.py --config config/pipeline.example.json --dry-run
python run_pipeline.py --config config/pipeline.example.json --watch --poll-interval-seconds 60
```

To produce a first real MP4, place a licensed audio file in `data/manual_priority/`, add a same-name `.lrc`, `.srt`, `.json`, or `.txt` lyric file, then run without `--dry-run`.

## Configuration

Important files:

- `.env.example`: backend/API/worker environment variables
- `apps/web/.env.example`: frontend API base URL
- `apps/api-nest/.env.example`: Nest.js companion API settings
- `config/pipeline.example.json`: local pipeline paths, clip targets, lyric settings, segment scoring, render settings, schedule windows
- `alembic.ini` and `migrations/`: database migration setup
- `docker-compose.yml`: local Postgres + API + worker
- `render.yaml`: Render blueprint using Postgres and a persistent disk
- `vercel.json`: experimental Vercel Services config for a preview deployment of the Next.js UI plus FastAPI API
- `deploy/linux/`: Caddy, systemd, and production env examples for a small Linux host

Production-facing API containers should set `API_HOST=0.0.0.0`; local development keeps the safer loopback default. Manual intake upload limits are configurable with `MAX_AUDIO_UPLOAD_MB`, `MAX_COVER_UPLOAD_MB`, and `MAX_LYRICS_UPLOAD_MB`.

## Deployment Shape

The intended split is:

- Next.js admin UI on Vercel or another frontend host
- FastAPI API and worker in Docker on an always-on backend host
- Postgres as the system of record
- Persistent disk or object storage for generated media artifacts

The Render blueprint combines API and worker in one Docker service through `src/tiktok_platform/render_entrypoint.py`. That is convenient for a small deployment, but separating API and worker services would be cleaner once traffic or render volume grows.

The Vercel config is for a UI/API preview, not the whole media system: Vercel can build the Next.js UI and route `/api/*` to FastAPI through Services, but the long-running worker and generated media storage still belong on an always-on backend host or object storage-backed design.

## Tradeoffs And Remaining Gaps

- Alembic is wired with an initial baseline migration. The next step is to use migration revisions for every schema change and remove any reliance on startup table creation in production.
- Search now exists as `/search`: SQLite/dev uses substring matching, while Postgres uses full-text ranking and migration-managed indexes for songs and clip captions. Lyrics-line indexing and Elasticsearch/OpenSearch are still future work if the product needs deeper discovery.
- A Nest.js companion API exists in `apps/api-nest` for read/search resources over the Postgres schema. The FastAPI service still owns the media-heavy mutation paths; replacing or fully porting those endpoints would be a later phase.
- The worker is a single-process poller. For higher volume, render and upload jobs should move to an explicit queue with separate worker pools, backoff policies, and stronger concurrency controls.
- TikTok direct posting depends on account capability, app approval, and platform policy. The app has simulation and draft modes so development does not require publishing.
- OAuth tokens are encrypted at rest with a configured Fernet key. A managed KMS/secrets store would be stronger for multi-environment production.
- Media files are local/persistent-disk based. Object storage plus signed URLs would be better for multi-host deployments.

## Why This Matters

This repo is close to music-product backend work: ingesting media metadata, modeling content state, making asynchronous jobs observable, protecting publish paths, and giving operators enough context to make decisions. The stack is different from a Nest.js/Postgres/search backend, but the engineering problems are adjacent and concrete.

For stats.fm-specific application notes, see [docs/STATSFM_APPLICATION_PACKAGE.md](docs/STATSFM_APPLICATION_PACKAGE.md).
