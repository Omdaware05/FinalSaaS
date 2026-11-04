# FinalSaaS — Setup Guide

Two ways to run FinalSaaS:

- **A. Docker** — best for a server or a quick evaluation. One command.
- **B. Laptop one-click (no Docker)** — best for development and demos on your own machine.

Both end at the same place: dashboard on <http://localhost:5173>, backend API on <http://localhost:8001> (`/docs` for Swagger, `/health` for status).

---

## A. Docker setup (Windows / macOS / Linux)

**Prerequisite:** Docker Desktop (or Docker Engine + Compose plugin).

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at minimum:

| Setting | Value |
|---|---|
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ADMIN_PASSWORD` | a strong password you choose (the seed creates the admin with it) |
| `SARVAM_API_KEY` | your Sarvam key (unless using local models) |
| `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN`, `VOBIZ_FROM_NUMBER` | your VoBiz carrier credentials + caller ID |
| `PUBLIC_BASE_URL` | public https URL of this machine (domain, or a tunnel — see below) |
| `WEBHOOK_SECRET` | another generated random string |

Then:

```bash
docker compose up --build
```

Open <http://localhost:5173> and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

Stop with `docker compose down` (your data survives in the `finalsaas_data` volume).

---

## B. Laptop one-click setup (no Docker)

**Prerequisites:** Python **3.11+** (<https://www.python.org/downloads/>) and Node.js **18+ LTS** (<https://nodejs.org>). On Windows, tick *"Add python.exe to PATH"* in the Python installer.

### Windows

1. Double-click **`setup.bat`** — it checks versions, creates `backend/.venv`, installs backend + frontend dependencies, creates `backend/.env` with a **generated** `SECRET_KEY` and **generated admin password**, initialises and seeds the database, and **prints your admin email + password. Save them.**
2. Double-click **`start.bat`** — starts the backend and dashboard in the background of that window. Close the window (or Ctrl+C) to stop both.

### macOS / Linux

```bash
chmod +x setup.sh start.sh   # first time only
./setup.sh                   # same as above; credentials printed at the end
./start.sh                   # Ctrl+C stops both servers
```

Then open <http://localhost:5173> and log in.

**What the seed creates:** your admin account plus the 3 demo agents (Admission & Career Counselor, Priya — Real Estate, Raj — Broadband Support) when `SEED_DEMO=true`.

### Making real calls from a laptop

The carrier (VoBiz) must reach your backend over the public internet for the answer/stream/hangup webhooks. On a laptop, use a tunnel:

```bash
ngrok http 8001
# or: cloudflared tunnel --url http://localhost:8001
```

Copy the `https://…` URL it gives you into `backend/.env` as `PUBLIC_BASE_URL=…`, restart (`start.bat` / `start.sh`), add your VoBiz + Sarvam keys to the same file, and dial from the dashboard. Free tunnel URLs change every restart — update `PUBLIC_BASE_URL` each time.

---

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| Calls fail with `TELEPHONY_NOT_CONFIGURED` | The backend has no usable carrier credentials. | Set `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN` and `VOBIZ_FROM_NUMBER` in `backend/.env`, then restart the backend. |
| Calls fail with `PUBLIC_URL_NOT_CONFIGURED` | `PUBLIC_BASE_URL` is empty, `http://`, or localhost — the carrier cannot reach your webhooks, so the call is refused *before* dialling (by design). | Set `PUBLIC_BASE_URL` to a public **https** URL: your domain in production, or a tunnel URL (`ngrok http 8001`) for laptop demos. Restart after changing it. |
| "Port 8001 / 5173 already in use" on start | Something else (often an older FinalSaaS run) holds the port. | Stop the old run first. Windows: `netstat -ano \| findstr :8001` then `taskkill /PID <pid> /F`. macOS/Linux: `lsof -i :8001` then `kill <pid>`. Or close the old `start.bat`/`start.sh` window. |
| Setup says Python is missing / too old | Python < 3.11 or not on PATH. | Install Python 3.11+ from python.org (Windows: tick *"Add python.exe to PATH"*), open a **new** terminal/window, re-run setup. |
| Setup says Node is missing / too old | Node < 18 or not installed. | Install the current LTS from nodejs.org, open a new terminal, re-run setup. |
| Dashboard loads but every screen errors / spins | The frontend can't reach the backend. | Check `http://localhost:8001/health` in the browser. If it's down, look at `logs/backend.log`. In Docker: `docker compose logs backend`. |
| Login fails with the printed password | The DB was seeded earlier with a different password — re-running setup does **not** overwrite existing credentials. | Use the password from your *first* setup run (it's the `ADMIN_PASSWORD` in `backend/.env`). To reset from scratch, stop everything, delete `backend/data/` (or the `finalsaas_data` Docker volume) and re-run setup — **this deletes all data**. |
| Call connects but there is silence | Usually a wrong/expired tunnel URL, or an invalid Sarvam key. | Confirm `PUBLIC_BASE_URL` matches the *current* tunnel URL and `/health` shows the voice provider configured; check `logs/backend.log` for the disposition recorded for that call. |
| Call fails with `INSUFFICIENT_BALANCE` | The VoBiz account is out of balance. | Recharge VoBiz. The platform deliberately does not auto-retry these. |
| Recipient hears the call at a wrong time / call refused as outside hours | The calling-hours gate (default 09:00–21:00 `Asia/Kolkata`). | Adjust `CALLING_HOURS_START`, `CALLING_HOURS_END`, `BUSINESS_TIMEZONE` in `backend/.env` if your use case legally allows it. |
