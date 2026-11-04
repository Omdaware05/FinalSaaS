# FinalSaaS — Production Guide

FinalSaaS ships demo-friendly defaults (SQLite, local disk, one process). This is the checklist to turn an installation into a production deployment. Work top to bottom.

## 1. Real domain + TLS (required)

Carrier webhooks and the media WebSocket need a stable public **https/wss** origin.

- Point a domain (e.g. `calls.yourcompany.com`) at your server.
- Terminate TLS at a reverse proxy — Caddy (automatic HTTPS) or nginx + Certbot — and proxy:
  - `/` → frontend (or serve the built frontend statically)
  - `/api/` → `http://127.0.0.1:8001`, **with WebSocket upgrade enabled** (`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`) and `proxy_read_timeout 3600s;` — the carrier media stream lives under `/api/v1/webhooks/…/stream` and long calls must not be cut.
- Set `PUBLIC_BASE_URL=https://calls.yourcompany.com` in `backend/.env`. No tunnels (ngrok/cloudflared quick tunnels) in production — their URLs change and are not yours.
- Set `CORS_ORIGINS=["https://calls.yourcompany.com"]`.

## 2. PostgreSQL (compose profile)

SQLite is fine for one small deployment, but PostgreSQL is the production choice.

```bash
# root-level .env (NOT backend/.env) — read by docker compose itself:
echo "POSTGRES_PASSWORD=<strong-random-password>" > .env

# backend/.env:
# DATABASE_URL=postgresql+asyncpg://finalsaas:<same-password>@postgres:5432/finalsaas

docker compose --profile postgres up --build -d
```

No password is hardcoded in `docker-compose.yml` — the postgres service refuses to start without `POSTGRES_PASSWORD`.

## 3. Recording storage → S3

Local disk fills up and dies with the machine. For production:

```ini
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=https://s3.amazonaws.com        # or your MinIO endpoint
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=finalsaas-recordings
S3_REGION=ap-south-1
```

Use a private bucket, a dedicated IAM user with access to only that bucket, and enable bucket versioning/lifecycle rules as your retention policy requires.

## 4. Backups

Back up **both** of these, on a schedule, off the machine:

- The **database** — `pg_dump` for PostgreSQL, or copy the SQLite file (stop the backend first, or use SQLite's `.backup`).
- The **data volume** — Docker: `finalsaas_data` (recordings/transcripts if `STORAGE_BACKEND=local`); laptop installs: `backend/data/`.

Test a restore at least once. An untested backup is a hope, not a backup.

## 5. Secrets

- Generate `SECRET_KEY` and `WEBHOOK_SECRET` with `secrets.token_urlsafe(48)` — never reuse the example placeholders.
- Rotate immediately if a `.env` was ever shared, committed, or included in a client ZIP.
- To rotate `SECRET_KEY`: set the new value and restart — all existing logins are invalidated (users log in again).
- Keep `.env` file permissions tight (`chmod 600 backend/.env`) and out of every archive you send.

## 6. Scaling — read this before adding replicas

**Run exactly ONE backend replica.**

The callback dispatcher and the batch dialler are in-process asyncio components started by the app lifespan, and the backend image runs a single uvicorn process on purpose. Two replicas = two dispatchers = duplicate customer calls.

To handle more calls, scale *within* the one process first: raise `MAX_CONCURRENT_CALLS_PER_AGENT` only as far as your carrier trunk channels allow, and give the host more CPU/RAM. True horizontal scaling requires moving the dispatcher/dialler to a separate worker process with a shared queue (e.g. Redis) — a deliberate refactor, not a config change. The frontend and PostgreSQL scale independently without issue.

## 7. Monitoring

- Poll `GET /health` (unauthenticated, returns status only) with your uptime monitor — it covers database, storage, voice provider and carrier configuration.
- Watch the backend logs for call dispositions: rising `INSUFFICIENT_BALANCE`, `CARRIER_ERROR` or `PUBLIC_URL_NOT_CONFIGURED` should page a human, and a low VoBiz balance alert should fire *before* the balance hits zero.
- Keep an eye on disk usage of the data volume if recordings stay local.

## 8. Pre-launch checklist

- [ ] Domain + TLS working; `PUBLIC_BASE_URL` set; a test call completes end-to-end.
- [ ] PostgreSQL profile in use; backups scheduled **and restore-tested**.
- [ ] Recordings on S3 (private bucket).
- [ ] Fresh `SECRET_KEY` / `WEBHOOK_SECRET`; default admin password changed.
- [ ] `SEED_DEMO=false` (or demo agents deleted) on the customer-facing install.
- [ ] VoBiz balance topped up + low-balance alerting in place.
- [ ] Calling-hours window matches the legal window for your calling use case; DNC/opt-out handling verified with a test number.
- [ ] Exactly one backend replica running.
