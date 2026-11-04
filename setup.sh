#!/usr/bin/env bash
# ============================================================
# FinalSaaS — one-click laptop setup (macOS / Linux, no Docker)
#
#   ./setup.sh
#
# Checks Python + Node, installs backend and frontend
# dependencies, creates backend/.env with a GENERATED secret
# key and admin password, initialises + seeds the database,
# and prints your admin login at the end. Safe to re-run.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "============================================================"
echo "  FinalSaaS setup"
echo "============================================================"

fail() { echo ""; echo "ERROR: $1" >&2; echo "$2" >&2; exit 1; }

# ---------- 1. Check Python 3.11+ ----------
PYTHON_BIN=""
for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then PYTHON_BIN="$cand"; break; fi
done
[ -n "$PYTHON_BIN" ] || fail "Python not found." \
    "Install Python 3.11 or newer from https://www.python.org/downloads/ and run this script again."
"$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
    || fail "Python 3.11+ is required (found: $("$PYTHON_BIN" --version 2>&1))." \
       "Install Python 3.11 or newer from https://www.python.org/downloads/ and run this script again."
echo "[ok] $("$PYTHON_BIN" --version 2>&1)"

# ---------- 2. Check Node 18+ ----------
command -v node >/dev/null 2>&1 || fail "Node.js not found." \
    "Install Node.js 18 or newer (LTS) from https://nodejs.org and run this script again."
node -e 'process.exit(parseInt(process.versions.node.split(".")[0], 10) >= 18 ? 0 : 1)' \
    || fail "Node.js 18+ is required (found: $(node --version))." \
       "Install Node.js 18 or newer (LTS) from https://nodejs.org and run this script again."
command -v npm >/dev/null 2>&1 || fail "npm not found (it normally ships with Node.js)." \
    "Reinstall Node.js LTS from https://nodejs.org and run this script again."
echo "[ok] Node $(node --version) / npm $(npm --version)"

# ---------- 3. Backend: virtualenv + dependencies ----------
echo ""
echo "Installing backend dependencies..."
if [ ! -x "backend/.venv/bin/python" ]; then
    "$PYTHON_BIN" -m venv backend/.venv
fi
VENV_PY="$ROOT/backend/.venv/bin/python"
"$VENV_PY" -m pip install --quiet --upgrade pip
"$VENV_PY" -m pip install -r backend/requirements.txt
echo "[ok] Backend dependencies installed"

# ---------- 4. Frontend dependencies ----------
echo ""
echo "Installing frontend dependencies..."
( cd frontend && npm install )
echo "[ok] Frontend dependencies installed"

# ---------- 5. Environment file + generated credentials ----------
ADMIN_PASS=""
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    # Generate a random SECRET_KEY and ADMIN_PASSWORD and write them
    # into backend/.env. Only the password is printed (once, below).
    ADMIN_PASS="$("$VENV_PY" - <<'PYEOF'
import pathlib, secrets, string
p = pathlib.Path("backend/.env")
lines = p.read_text(encoding="utf-8").splitlines()
secret = secrets.token_urlsafe(48)
password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(14))
out = []
for line in lines:
    if line.startswith("SECRET_KEY="):
        out.append("SECRET_KEY=" + secret)
    elif line.startswith("ADMIN_PASSWORD="):
        out.append("ADMIN_PASSWORD=" + password)
    else:
        out.append(line)
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print(password)
PYEOF
)"
    echo "[ok] Created backend/.env with a generated SECRET_KEY and admin password"
else
    echo "[ok] backend/.env already exists — leaving your credentials unchanged"
fi
ADMIN_EMAIL="$(grep -E '^ADMIN_EMAIL=' backend/.env | head -1 | cut -d= -f2-)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@finalsaas.local}"

# ---------- 6. Initialise database + seed demo data ----------
echo ""
echo "Initialising database and seeding demo agents..."
( cd backend && "$VENV_PY" -m app.seed )
echo "[ok] Database ready"

# ---------- 7. Done ----------
echo ""
echo "============================================================"
echo "  SETUP COMPLETE — SAVE THESE ADMIN CREDENTIALS"
echo "============================================================"
echo "  Login email:    $ADMIN_EMAIL"
if [ -n "$ADMIN_PASS" ]; then
    echo "  Admin password: $ADMIN_PASS"
else
    echo "  Admin password: (unchanged — it is the ADMIN_PASSWORD in backend/.env)"
fi
echo ""
echo "  Next steps:"
echo "    1. Start everything:        ./start.sh"
echo "    2. Open the dashboard:      http://localhost:5173"
echo "    3. Log in with the credentials above."
echo ""
echo "  To make REAL phone calls you also need, in backend/.env:"
echo "    - VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER"
echo "    - SARVAM_API_KEY (or VOICE_PROVIDER=local, see docs/LOCAL_MODELS.md)"
echo "    - PUBLIC_BASE_URL — a public https address for this laptop, e.g.:"
echo "          ngrok http 8001        # then copy its https URL into PUBLIC_BASE_URL"
echo "      Without it, calls fail with PUBLIC_URL_NOT_CONFIGURED (by design)."
echo "============================================================"
