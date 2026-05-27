# SSS Nest.js Companion API

This is a TypeScript/Nest.js companion API for the existing SSS platform schema. It is intentionally read-first: the current FastAPI service still owns auth, uploads, TikTok OAuth, and media mutation workflows. This service is the realistic next step toward a Nest.js/Postgres backend without rewriting the media worker too early.

Current endpoints:

- `GET /health`
- `GET /songs?limit=50`
- `GET /songs/:id`
- `GET /clips?limit=50`
- `GET /clips/:id`
- `GET /search?q=midnight&limit=20`

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

This package expects a Postgres database with the SSS schema. Run the Python Alembic migrations first:

```powershell
alembic upgrade head
```
