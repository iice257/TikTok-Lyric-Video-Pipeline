# Architecture Notes

This project has two related layers:

- the original media pipeline in `src/tiktok_lyric_pipeline`
- the platform/control plane in `src/tiktok_platform`, `src/tiktok_platform_api`, `src/tiktok_platform_worker`, and `apps/web`

The pipeline can run alone from the CLI, but the more interesting backend work is in the platform layer: it turns a one-off script into an operator-facing system with auth, REST endpoints, stateful jobs, retries, alerts, and deployment config.

## Component Boundaries

| Component | Path | Responsibility |
| --- | --- | --- |
| API | `src/tiktok_platform_api` | FastAPI app, auth routes, dashboard routes, platform REST resources |
| Nest companion API | `apps/api-nest` | TypeScript/Nest.js read/search API over the same Postgres schema |
| Domain/database | `src/tiktok_platform` | SQLAlchemy models, DB session setup, settings, security helpers, TikTok API client, serializers |
| Worker | `src/tiktok_platform_worker` | Long-running loop for intake sync, lyrics, segments, render jobs, upload jobs, heartbeats, health checks |
| Pipeline | `src/tiktok_lyric_pipeline` | Song intake, lyric parsing/alignment, segment scoring, style decisions, render planning, scheduling |
| Web UI | `apps/web` | Next.js admin panel for operators |
| Deployment | `docker/`, `deploy/`, `render.yaml` | Docker image, Compose, Render, and Linux host deployment notes |
| Migrations | `alembic.ini`, `migrations/` | Alembic baseline schema and migration runner |

## Data Flow

```text
1. Song enters through manual upload or provider feed files.
2. API/worker creates a Song and SongInput record.
3. Worker resolves lyrics and stores a LyricsArtifact.
4. Segment scorer creates SegmentCandidate rows and selected Clip rows.
5. Worker claims a RenderJob, writes ASS/manifests, and calls ffmpeg when available.
6. Successful render creates or resets an UploadJob.
7. Worker claims due UploadJob rows, chooses direct or draft mode, and talks to TikTok APIs.
8. StateEvent, Alert, WorkerHeartbeat, and OperatorAction rows keep the process explainable.
```

## Job Model

Render jobs and upload jobs both use:

- `status` fields for queue and terminal states
- `idempotency_key` values to avoid accidental duplicates
- `claimed_by`, `claimed_at`, and `lease_expires_at` for cooperative worker ownership
- `attempt_count` for retry visibility
- `completed_at` plus error/platform payload fields for operator review

The worker periodically reconciles expired leases. That matters because media jobs can fail in awkward ways: ffmpeg can hang, uploads can time out, and platform polling can need multiple passes.

## Important Models

| Model | Why it exists |
| --- | --- |
| `Song` | One normalized track/intake unit, including rights status and publish eligibility |
| `LyricsArtifact` | Parsed or aligned lyrics with timing confidence and raw source metadata |
| `SegmentCandidate` | Scored clip window with reason fields so selections can be inspected |
| `Clip` | User-facing render unit with style, caption, artifact paths, review state, and schedule |
| `RenderJob` | Queue record for subtitle/manifest generation and ffmpeg rendering |
| `UploadJob` | Queue record for TikTok direct/draft upload and publish-status polling |
| `StateEvent` | Append-only transition log for debugging and auditability |
| `Alert` | Operator-visible warnings and failures |
| `OperatorAction` | Audit trail for manual changes |
| `WorkerHeartbeat` | Liveness and current-loop reporting |

## Security And Operational Choices

- Cookie sessions are HTTP-only.
- Mutating API calls require the session CSRF token.
- Production startup validates secrets, database choice, cookie security, and upload simulation settings.
- Production requires `TOKEN_ENCRYPTION_KEY`; stored TikTok OAuth access and refresh tokens are encrypted with Fernet.
- Media access goes through `resolve_managed_path`, which only allows files under managed storage, `data`, or `output`.
- Manual upload filenames are not trusted for paths; generated storage paths use sanitized artist/title names and UUID folders.
- Uploaded audio is hashed and deduped before creating duplicate song records.
- Manual intake validates audio, cover, and lyric extensions before writing files.

## Deployment Topology

Local development has two options:

- SQLite-backed API/worker for fast iteration.
- Docker Compose with Postgres, API, and worker.
- No-Docker process orchestration with `scripts/dev-no-docker.ps1` for API, worker, and web.

The production-oriented shape is:

```text
Vercel or frontend host
        |
        v
HTTPS backend host
        |
        +-- FastAPI API container
        +-- worker container/process with ffmpeg
        +-- Postgres
        +-- persistent media storage
```

`render.yaml` currently runs API and worker together through `src/tiktok_platform/render_entrypoint.py`. That is acceptable for a small hosted demo, but separate services are cleaner for production scaling and independent restarts.

## Honest Next Steps

These are the next engineering steps I would take before calling this production-grade:

- Continue using Alembic revisions for every schema change. Container startup now applies migrations, while `Base.metadata.create_all` remains limited to local and preview environments.
- Split API and worker into separate deployment units.
- Add object storage for media artifacts and serve signed URLs instead of local file paths.
- Move token encryption keys into a managed KMS/secrets system.
- Add request-size limits and deeper content validation for uploaded media.
- Add lyric-line search and tune the Postgres full-text indexes against real catalog data.
- Add Elasticsearch/OpenSearch only if the product needs typo tolerance, richer filters, or analytics-backed discovery beyond Postgres full-text search.
- Expand the Nest.js companion API from read/search endpoints into mutation workflows after the contracts settle.
