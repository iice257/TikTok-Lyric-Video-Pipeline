# SSS Nest.js Companion API

This is a TypeScript/Nest.js companion API for the existing SSS platform schema. It is intentionally read-first: the current FastAPI service still owns auth, uploads, TikTok OAuth, and media mutation workflows. This service is the realistic next step toward a Nest.js/Postgres backend without rewriting the media worker too early.

Current endpoints:

- `GET /health`
- `GET /songs?limit=50`
- `GET /songs/:id`
- `GET /clips?limit=50`
- `GET /clips/:id`
- `GET /jobs?limit=50`
- `GET /jobs/:id`
- `GET /alerts?limit=50`
- `GET /alerts/:id`
- `GET /workers`
- `GET /workers/:id`
- `GET /lyrics-artifacts?limit=50`
- `GET /lyrics-artifacts/:id`
- `GET /search?q=midnight&limit=20`

Search is intentionally Postgres full-text here. It covers songs, clips, and lyrics artifact metadata; deeper lyric-line search still belongs in the main platform search layer once line-level indexing is added to the schema.

Security:

- If `READ_ONLY_API_KEY` is set, requests must include `x-api-key`.
- Leave it blank only for local development.

Local run, once Node/npm are available:

```powershell
cd apps/api-nest
copy .env.example .env
npm install
npm run dev
```

The repo CI installs this package and runs `npm run build`. A lockfile should be generated with `npm install --package-lock-only` once npm is available locally.

This package expects a Postgres database with the SSS schema. Run the Python Alembic migrations first:

```powershell
alembic upgrade head
```
