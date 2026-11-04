# FinalSaaS — AI Voice Calling Platform

FinalSaaS places and receives real phone calls with an AI voice agent. You create an agent (name, voice, script/questions), give it contacts or a campaign, and the platform dials over VoBiz, holds a natural Hindi/English conversation using Sarvam AI (speech-to-text → LLM → text-to-speech), records and transcribes every call, and turns the conversation into qualified leads — interested, not interested, callback requested — with the customer's own words as evidence.

Built to be **safe by default**: real user logins (JWT), every dial passes a Do-Not-Call gate and a calling-hours window, carrier webhooks are signature-checked, credentials live only in `.env`, and failed calls say exactly why (`TELEPHONY_NOT_CONFIGURED`, `PUBLIC_URL_NOT_CONFIGURED`, `INSUFFICIENT_BALANCE`, …) instead of failing silently.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (dashboard)                                             │
│     │  relative /api/v1 calls — no hardcoded backend URL         │
│     ▼                                                            │
│  Frontend — React + Vite                                         │
│     │  Docker: nginx serves the SPA and proxies /api/ ───────┐   │
│     │  Laptop: Vite dev server proxies /api/ ────────────────┤   │
│     ▼                                                        ▼   │
│  Backend — FastAPI (single process, port 8001)                   │
│    ├── JWT auth · tenant scoping from the login, never headers   │
│    ├── DNC gate + calling-hours gate on EVERY dial path          │
│    ├── Batch dialler (durable DB queue) + callback dispatcher    │
│    ├── Voice providers: Sarvam cloud │ local OpenAI-compatible   │
│    └── SQLite (default) or PostgreSQL · local or S3 recordings   │
│     ▲                                                            │
│     │  signed webhooks: answer / media-stream (WSS) / hangup     │
│  VoBiz (PSTN carrier) ──► Customer phone                         │
│  Sarvam AI: STT saaras:v3 · LLM · TTS bulbul:v3                  │
└──────────────────────────────────────────────────────────────────┘
```

## Quickstart

### Option A — Docker (one command)

```bash
cp backend/.env.example backend/.env
# edit backend/.env: set SECRET_KEY, ADMIN_PASSWORD, VoBiz + Sarvam keys, PUBLIC_BASE_URL
docker compose up --build
# open http://localhost:5173
```

### Option B — Laptop one-click (no Docker)

Windows: double-click **`setup.bat`**, then **`start.bat`**.
macOS / Linux:

```bash
./setup.sh    # checks Python 3.11+ & Node 18+, installs everything,
              # generates your SECRET_KEY + admin password, seeds the DB,
              # and PRINTS your admin login — save it
./start.sh    # backend :8001 + dashboard :5173, Ctrl+C stops both
# open http://localhost:5173
```

Full step-by-step + troubleshooting: [docs/SETUP.md](docs/SETUP.md).

> **Real calls need two things** beyond setup: VoBiz carrier credentials and a public HTTPS address (`PUBLIC_BASE_URL`) that VoBiz can reach — for a laptop demo, run `ngrok http 8001` and paste its https URL into `backend/.env`. Details in docs/SETUP.md.

## Demo agents (seeded on first run, `SEED_DEMO=true`)

| Agent | Voice | What it does |
|---|---|---|
| Admission & Career Counselor | Hindi, male | Course/admission enquiries, qualifies interest, books callbacks |
| Priya — Real Estate Advisor | Hindi, female | Property enquiries, budget/location capture, site-visit scheduling |
| Raj — Broadband Support | Hindi/English, male | Internet issue triage, plan help, engineer-visit follow-ups |

## How calling works

1. **Single call** from the dashboard, a **campaign/batch** upload, or a **scheduled callback** — all three go through the same gate: number validation → DNC check → calling-hours window (09:00–21:00 IST by default) → concurrency cap.
2. The backend asks **VoBiz** to dial, pointing it at signed webhook URLs under `PUBLIC_BASE_URL`.
3. When the customer answers, VoBiz opens a **bidirectional media WebSocket** to the backend; audio streams to the voice provider (**Sarvam** by default) for STT → LLM reply → TTS, with barge-in so the customer can interrupt.
4. On hangup, the recording + transcript are stored, and lead intelligence classifies the outcome. "Do not call" permanently suppresses the number on every future path; busy/no-answer create timed retry follow-ups — never for balance/carrier errors.

**Local models:** set `VOICE_PROVIDER=local` and point `LOCAL_AI_BASE_URL` at any OpenAI-compatible server (LM Studio, Ollama, a self-hosted Whisper/LLM/Kokoro box). See [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md).

## Configuration (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `SECRET_KEY` | ✅ | Signs JWTs. Setup scripts generate it. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | First admin login, created by the seed. |
| `PUBLIC_BASE_URL` | ✅ for calls | Public https URL carriers use for webhooks. |
| `WEBHOOK_SECRET` | ✅ for calls | Verifies carrier webhook signatures. |
| `VOBIZ_AUTH_ID` / `VOBIZ_AUTH_TOKEN` / `VOBIZ_FROM_NUMBER` | ✅ for calls | Carrier account + caller ID. |
| `VOICE_PROVIDER` | — | `sarvam` (default) or `local`. |
| `SARVAM_API_KEY` (+ model overrides) | for sarvam | Sarvam cloud STT/LLM/TTS. |
| `LOCAL_AI_BASE_URL` (+ `LOCAL_*_MODEL`) | for local | Your OpenAI-compatible model server. |
| `DATABASE_URL` | — | SQLite default; PostgreSQL for production. |
| `CALLING_HOURS_START/END`, `BUSINESS_TIMEZONE` | — | Legal dialling window (default 9–21, Asia/Kolkata). |
| `MAX_CONCURRENT_CALLS_PER_AGENT` | — | Hard concurrency cap (default 5). |
| `STORAGE_BACKEND`, `S3_*` | — | `local` disk or S3/MinIO for recordings. |
| `CORS_ORIGINS` | — | Allowed dashboard origins (JSON list). |
| `SEED_DEMO` | — | Seed the 3 demo agents on first run. |

Every variable is documented in `backend/.env.example`.

## Production

Before taking real customers: put it behind a real domain with TLS, switch to the PostgreSQL compose profile, move recordings to S3, schedule backups of the data volume + database, rotate secrets, and run **one** backend replica (the dispatcher is in-process by design). Full checklist: [docs/PRODUCTION.md](docs/PRODUCTION.md).

## Security notes

- Passwords are hashed; sessions are JWTs; tenant/business scope comes from the authenticated user — never from a header or query parameter a client can set.
- The dial gate (DNC + calling hours + concurrency) is shared by single calls, batches and callbacks — no path bypasses it.
- Carrier webhooks must carry a valid signature (`WEBHOOK_SECRET`); the media WebSocket validates its signed token before streaming.
- No credentials in code or compose files — everything comes from `.env`, which is git-ignored. Carrier/AI provider errors surface as clear dispositions, never silent dead air.

## License

Proprietary — © ARB SoftTech / Om Daware. All rights reserved.
