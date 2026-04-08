# Linux Host Deploy

This path is for the README's "frontend on Vercel, backend on one always-on Linux host" topology.

## Host prerequisites

- Ubuntu or another systemd-based Linux host
- Docker Engine with Compose v2
- A DNS record pointing `BACKEND_DOMAIN` at the host

## Files

- `backend.env.example`: production env template
- `Caddyfile`: HTTPS reverse proxy for the API
- `tiktok-lyric-platform.service`: systemd unit for the compose stack

## Install

1. Clone the repo to `/opt/tiktok-lyric-platform`
2. Copy `deploy/linux/backend.env.example` to `deploy/linux/backend.env`
3. Set `BACKEND_DOMAIN`, `FRONTEND_BASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, and TikTok credentials
4. Install the systemd unit:

```bash
sudo cp deploy/linux/tiktok-lyric-platform.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tiktok-lyric-platform.service
```

## Manual compose fallback

```bash
docker compose --env-file deploy/linux/backend.env -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
