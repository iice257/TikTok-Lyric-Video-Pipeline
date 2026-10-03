# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (Python 3.11+, installed editable from repo root):

```powershell
python -m pip install -e .
python -m pytest                                   # full suite (what CI runs, plus pip check + compileall)
python -m pytest tests/test_platform_worker.py     # one file
python -m pytest tests/test_platform_api_smoke.py::test_health_and_login   # one test
python -m tiktok_platform_api.app                  # API on :8000 (API_PORT overrides)
python -m tiktok_platform_worker.main --poll-interval-seconds 20
python run_pipeline.py --config config/pipeline.example.json --dry-run   # standalone pipeline, no DB
```

Web (`apps/web`, Next.js 15): `npm install`, `npm run dev`, `npm run build` (CI builds; there is no lint or test script).

All three local processes at once (no Docker needed; SQLite by default): `.\scripts\dev-no-docker.ps1`. It starts API, worker and web as hidden background processes and logs to `.tmp\runlogs\` (`api.err.log` holds uvicorn output and tracebacks). Dev login is created automatically when `ADMIN_PASSWORD_HASH` is empty: `admin99` / `admin99`.

Docker (`docker compose up --build`) is optional and only needed for the Postgres-backed stack.

## Gotchas

- Python code reads config only from real environment variables (`os.getenv` in `src/tiktok_platform/settings.py`). Nothing loads `.env` files, so set variables in the shell or process manager. The web app does read `apps/web/.env.local` through Next.js.
- `get_settings()` is `lru_cache`d and `tiktok_platform.db` builds the engine at import time. Tests set env with `monkeypatch` and then `importlib.reload` the modules (see `build_test_client` in `tests/test_platform_api_smoke.py`); follow that pattern when a test needs different settings.
- Rendering shells out to `ffmpeg`, resolved via `FFMPEG_BINARY` or `PATH`. If it cannot be found the render becomes `planned_only` and the clip fails with an "ffmpeg not found" error. Subtitles, manifests and the ffmpeg command are still written to `output/render_work/`.
- `APP_ENV=prod` turns on strict startup validation (`validate_runtime_settings`): Postgres URL, strong `SESSION_SECRET`, Fernet `TOKEN_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `COOKIE_SECURE=true`, `TIKTOK_SIMULATE_UPLOADS=false`. In prod, `init_db` skips `create_all`, so schema comes from Alembic migrations in `migrations/`. In dev, tables are auto-created.
- `TIKTOK_SIMULATE_UPLOADS` defaults to true, so the upload adapter returns a fake "posted" result without calling TikTok.
- The backend runs locally only. Vercel (`vercel.json`) deploys the frontend alone; there the login page detects that no backend is configured and disables sign-in. Routers are still mounted at both `/` and `/api`. Persistent hosting options, if ever needed, are `render.yaml` and `deploy/linux/`.
- Dev mode only runs `create_all`, which adds missing tables but never new columns. After changing a model, add an Alembic migration and either delete `output/platform.db` locally or run the migration.
- Render presets live in `config/presets.json`: one per VISUALICER theme plus `surprise` (the original random styling). A song's `preset_id` is turned into a fixed `StyleDecision` in `stages/styling.py`; the clip stores the resulting font/colors/motion plus `preset_id`, and rerenders read background color and grain back from the preset.
- `apps/web/public/visualizer/` is a copy of the separate VISUALICER repo's `public/visualizer.html` (as `index.html`) plus its fonts. Those TTFs are also the renderer's `fontsdir`, so preset fonts must name a family that exists there. `apps/web/lib/themes.json` mirrors VISUALICER's `THEMES`/`FONTS` for the app's own theming; re-sync both when VISUALICER changes.
- When a mutation endpoint creates a row and then calls `record_state_event` with the new row's id, call `db.flush()` first. Otherwise the id is still `None` and the insert hits a NOT NULL error.

## Architecture

Two layers share one repo (see `docs/ARCHITECTURE.md`):

1. **Pipeline library** `src/tiktok_lyric_pipeline`: stateless stages in `stages/`: intake → lyrics (LRC/SRT/JSON/TXT, cache, sidecar, remote) → alignment fallback → segment scoring (picks non-overlapping 30–60 s windows by repetition/loudness/musicality) → styling → render planning (ASS subtitles + manifest + ffmpeg command) → `FFmpegRenderer` → scheduling. Driven by `config/pipeline.*.json` (`PIPELINE_CONFIG_PATH`). It can run alone via `run_pipeline.py` and the CLI.
2. **Platform/control plane**, which wraps those stages with persistence and operators:
   - `src/tiktok_platform`: SQLAlchemy models, settings, DB session, security (PBKDF2 passwords, session tokens, CSRF), Fernet token crypto, the TikTok Content Posting API client, and `services.py` (shared domain logic and serializers used by both API and worker).
   - `src/tiktok_platform_api`: FastAPI app. `routers/auth.py` (cookie sessions, and every mutation needs an `x-csrf-token` header), `routers/dashboard.py`, `routers/platform.py` (songs, manual intake, clips, jobs, upload jobs, TikTok OAuth, alerts, media serving restricted to managed roots).
   - `src/tiktok_platform_worker/engine.py`: one polling loop that advances songs through `ingested → lyrics_ready → queued_for_render`, creates `SegmentCandidate`/`Clip`/`RenderJob` rows, claims render and upload jobs with leases and idempotency keys, retries, writes heartbeats, and raises `Alert`s. Adapters in `adapters.py` convert DB rows into pipeline models.
   - `apps/web`: Next.js UI (plain JS, Tailwind, shadcn-style components in `components/ui`). Pages: Home `/`, New video `/new`, Library `/songs` (+ `/songs/[id]`, `/clips/[id]`), Schedule `/queue`, Visualizer `/visualizer` (iframes the VISUALICER copy), Settings `/settings` (Alerts `/alerts` and Activity `/logs` hang off it). Colors come from `lib/theme.js`, which maps a VISUALICER palette onto the shadcn CSS variables; `useResource` in `components/client-page.js` polls every 2s while an `isActive` predicate says work is in flight, 15s otherwise. Every call goes through `lib/api.js` `apiFetch`, which picks the API base URL (`NEXT_PUBLIC_API_BASE_URL`, `/api` on Vercel, `localhost:8000` locally), sends cookies, attaches the CSRF token from localStorage, and redirects to `/login` on 401.

Traceability is a design rule: state changes go through `record_state_event` (append-only `state_events`), operator mutations through `log_operator_action`, and failures surface as `alerts`. Songs carry `environment` (`prod`/lab) and `rights_status`; only `prod` + publish-eligible songs reach the upload path.
