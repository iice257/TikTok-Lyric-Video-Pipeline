# stats.fm Application Package

This note is for positioning SSS honestly for the stats.fm Backend Engineer role. The core production path is still FastAPI/Python, but the repo now includes a TypeScript/Nest.js companion API scaffold over the same Postgres schema. The right framing is backend proof with a clear bridge toward the stats.fm stack: music-domain data, API design, job processing, media metadata, operator tooling, search, and product judgment.

## What Already Maps Well

- TypeScript/Nest.js adjacency: the admin UI is Next.js/React, and `apps/api-nest` mirrors read/search resources in Nest.js over the Postgres schema.
- Music/media domain: the project handles songs, artists, lyrics, timed lyric artifacts, clip segments, captions, covers, and platform publishing.
- Data modeling: the schema separates songs, inputs, lyrics artifacts, segment candidates, clips, render jobs, upload jobs, state events, alerts, sessions, OAuth tokens, and operator actions.
- REST/API design: resources are organized around real operator workflows: intake, songs, clips, jobs, uploads, search, TikTok integration, alerts, workers, and dashboard health.
- Async/background processing: the worker uses leases, retry states, heartbeats, idempotency keys, status reconciliation, and publish-status polling.
- Database/search: SQLAlchemy models are Postgres-ready, Alembic has baseline plus search-index migrations, and `/search` supports Postgres full-text ranking with SQLite fallback.
- Product thinking: rights status, lab vs production environments, review-required clips, draft/direct upload modes, pause/resume, and alerts all reflect operational risk, not just happy-path generation.
- Maintainability/security: CSRF-protected cookie auth, production config validation, managed media paths, upload dedupe, supported-file validation, encrypted OAuth tokens, and explicit state events.
- Cloud-readiness: Docker/Compose remains available, but the repo also has a no-Docker local runner, Render config, Vercel-ready frontend env, and Linux deployment notes.

## Gaps To Be Honest About

- The main mutation backend is still FastAPI. The Nest.js app is a companion read/search layer, not a full rewrite.
- Alembic is wired, but production should consistently run migrations instead of relying on startup table creation.
- Search now exists through Postgres full-text for songs/clips, but it does not yet index every lyric line or use Elasticsearch/OpenSearch.
- The worker is a single-process poller. It is good for a focused project, but a production system would use a more explicit queue and separate worker pools.
- OAuth tokens are encrypted at rest when `TOKEN_ENCRYPTION_KEY` is configured, but a managed KMS/secrets setup would be stronger for production.
- There is no Flutter client. React/Next.js is the only client-side advantage covered.

## Realistic Next Step For This Repo

The realistic next step has started: `apps/api-nest` adds a TypeScript/Nest.js read/search API backed by Postgres. The next phase would be expanding it carefully instead of rewriting everything at once:

- add `lyricsArtifacts`, `renderJobs`, `uploadJobs`, `alerts`, and `workers` endpoints
- move production DB changes through Alembic only
- add lyric-line search and tune the Postgres full-text indexes against real data
- add Elasticsearch/OpenSearch only after the Postgres search path has clear product limits
- keep ffmpeg/media processing in a separate worker service so the API stays responsive

## CV Bullets

- Built SSS, a backend-heavy music media pipeline that ingests licensed songs and timed lyrics, scores high-potential lyric segments, generates vertical video render plans, and schedules TikTok-ready clips.
- Designed a FastAPI/SQLAlchemy control plane with REST resources for songs, clips, render jobs, upload jobs, alerts, workers, TikTok OAuth, search, and operator actions.
- Implemented a long-running worker with job leases, retries, idempotency keys, heartbeats, status reconciliation, ffmpeg rendering, and TikTok publish-status polling.
- Modeled rights status, lab vs production environments, review-required clips, encrypted OAuth tokens, and draft/direct publishing paths to reduce accidental publishing risk.
- Added deployment and operations polish: Alembic migrations, Docker/Postgres Compose stack, no-Docker local runner, Render blueprint, Vercel-ready Next.js admin UI, production config validation, CSRF-protected cookie auth, and pytest coverage for API and worker behavior.
- Started a TypeScript/Nest.js companion API over the same Postgres schema for read/search endpoints, keeping the heavier media processing in the worker.

## Short GitHub / Portfolio Description

SSS is a music-media automation project that turns licensed songs, timed lyrics, and trend metadata into short-form lyric video clips. The backend includes a FastAPI REST control plane, SQLAlchemy/Postgres data model, Alembic migrations, Postgres-aware search, encrypted OAuth token storage, worker leases/retries, ffmpeg render planning, TikTok OAuth/upload handling, alerts, audit events, a Next.js operator UI, and a small Nest.js companion API for read/search endpoints.

## Why This Project Is Relevant To stats.fm

stats.fm is obviously not a TikTok video tool, but the overlap is real: music metadata, user-facing media experiences, backend APIs, background processing, stateful workflows, and search/discovery. SSS shows how I think through a music product beyond the first endpoint: what needs to be modeled, what should be async, how operators recover from failed jobs, where rights and publishing risk matter, and how to keep the API understandable as the workflow grows. I also started the honest stack bridge: a Nest.js companion API over Postgres, Alembic migrations, and Postgres-aware search rather than pretending the original project was always built that way.

## Draft Email

Subject: Backend Engineer application - music backend project

Hi stats.fm team,

I'm applying for the Backend Engineer role. I'm especially interested because stats.fm sits in the part of software I enjoy most: music data, product detail, and backend systems that have to stay understandable as they grow.

My strongest proof-of-work is SSS, a project I built around turning licensed songs and timed lyrics into short-form lyric video clips. The main backend is FastAPI with SQLAlchemy, a worker process, and a Next.js admin UI, and I've also added a small Nest.js companion API over the same Postgres schema for read/search endpoints. I think it is relevant because the core problems are close to what your role describes: modeling music/media data, designing REST resources, running background jobs safely, handling OAuth/publishing flows, adding search, and making operational state visible instead of hidden in logs.

The project includes a REST control plane for songs, clips, render jobs, upload jobs, alerts, workers, search, and TikTok integration; a media worker with leases, retries, heartbeats, and ffmpeg rendering; and a data model that tracks lyrics artifacts, segment scoring, publish eligibility, audit events, and review states. I also documented the honest gaps: the Nest.js layer is read/search only today, Elasticsearch is not implemented, and the worker would need a real queue before I would call it production-scale.

GitHub: https://github.com/iice257/TikTok-Lyric-Video-Pipeline

I'd be glad to talk through the tradeoffs in the project and how I would keep moving it toward a Nest.js/Postgres/search backend without throwing away the media pipeline work.

Best,
Kingsley Afolabi Aremu

## Before Applying

- Confirm the branch/PR link is the one you want to send before applying.
- If the repo is public, make sure no real secrets, tokens, private media, or licensed files are committed.
- Consider recording a short walkthrough of the admin UI and worker flow if the project is easier to understand visually.
- If you have time for one more technical improvement, expand the Nest.js companion API to cover job/alert read endpoints or add lyric-line search.
