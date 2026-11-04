@echo off
REM ============================================================
REM  FinalSaaS - start backend + frontend (run setup.bat first)
REM
REM    start.bat
REM
REM  Backend  : http://localhost:8001   (logs\backend.log)
REM  Dashboard: http://localhost:5173   (logs\frontend.log)
REM
REM  Both servers run in this window's background. Press Ctrl+C
REM  or simply close this window to stop them.
REM ============================================================
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo Backend environment not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo Frontend dependencies not found. Run setup.bat first.
    pause
    exit /b 1
)

if not exist logs mkdir logs

echo Starting FinalSaaS backend on http://localhost:8001 ...
start /B "" cmd /c "cd /d backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 > ..\logs\backend.log 2>&1"

echo Starting FinalSaaS dashboard on http://localhost:5173 ...
start /B "" cmd /c "cd /d frontend && call npm run dev -- --host --port 5173 > ..\logs\frontend.log 2>&1"

echo.
echo ============================================================
echo   FinalSaaS is starting:
echo     Dashboard: http://localhost:5173
echo     API docs:  http://localhost:8001/docs
echo     Health:    http://localhost:8001/health
echo   Logs: logs\backend.log and logs\frontend.log
echo.
echo   To stop both servers: press Ctrl+C a couple of times,
echo   or just close this window.
echo ============================================================
echo.
pause
endlocal
