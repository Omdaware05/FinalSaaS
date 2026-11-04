#!/usr/bin/env bash
# ============================================================
# FinalSaaS — start backend + frontend (run ./setup.sh first)
#
#   ./start.sh
#
# Backend  : http://localhost:8001   (logs/backend.log)
# Dashboard: http://localhost:5173   (logs/frontend.log)
# Press Ctrl+C to stop both.
# ============================================================
set -uo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

if [ ! -x "backend/.venv/bin/python" ]; then
    echo "Backend environment not found. Run ./setup.sh first."
    exit 1
fi
if [ ! -d "frontend/node_modules" ]; then
    echo "Frontend dependencies not found. Run ./setup.sh first."
    exit 1
fi

mkdir -p logs

VENV_PY="$ROOT/backend/.venv/bin/python"

echo "Starting FinalSaaS backend on http://localhost:8001 ..."
( cd backend && "$VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8001 ) \
    > logs/backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting FinalSaaS dashboard on http://localhost:5173 ..."
( cd frontend && npm run dev -- --host --port 5173 ) \
    > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "Stopping FinalSaaS..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

echo ""
echo "============================================================"
echo "  FinalSaaS is starting:"
echo "    Dashboard: http://localhost:5173"
echo "    API docs:  http://localhost:8001/docs"
echo "    Health:    http://localhost:8001/health"
echo "  Logs: logs/backend.log and logs/frontend.log"
echo "        (watch live with: tail -f logs/backend.log)"
echo "  Press Ctrl+C to stop both servers."
echo "============================================================"

wait "$BACKEND_PID" "$FRONTEND_PID"
