# FinalSaaS Backend

AI voice calling SaaS — FastAPI, SQLAlchemy 2 (async), JWT auth, multi-tenant.

## Setup

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then set SECRET_KEY (required) and ADMIN_PASSWORD
```

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Run

```bash
.venv/bin/uvicorn app.main:app --port 8001
```

- API base: `http://localhost:8001/api/v1`
- Health: `GET /health`
- Docs: `http://localhost:8001/docs`

On first start (SQLite dev default) tables are created automatically and,
when `SEED_DEMO=true`, a demo tenant, the admin user (from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`) and three demo agents are seeded. Seed manually any time:

```bash
.venv/bin/python -m app.seed
```

## Production database (Postgres)

Set `DATABASE_URL=postgresql+asyncpg://...` and run migrations instead of
relying on dev auto-create:

```bash
.venv/bin/alembic upgrade head
```

## Outbound calling checklist

Calls are refused with a clear 422 until all of these are set in `.env`:
`VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN`, `VOBIZ_FROM_NUMBER`, and a public
`PUBLIC_BASE_URL` starting with `https://` (for local development, expose
port 8001 with ngrok/cloudflared and use that URL).

## Tests

```bash
.venv/bin/python -m pytest -q
```
