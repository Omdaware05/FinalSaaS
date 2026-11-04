@echo off
REM ============================================================
REM  FinalSaaS - one-click laptop setup (Windows, no Docker)
REM
REM    setup.bat
REM
REM  Checks Python + Node, installs backend and frontend
REM  dependencies, creates backend\.env with a GENERATED secret
REM  key and admin password, initialises + seeds the database,
REM  and prints your admin login at the end. Safe to re-run.
REM ============================================================
setlocal
cd /d "%~dp0"

echo ============================================================
echo   FinalSaaS setup
echo ============================================================

REM ---------- 1. Check Python 3.11+ ----------
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
    where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
    echo.
    echo ERROR: Python not found.
    echo Install Python 3.11 or newer from https://www.python.org/downloads/
    echo ^(tick "Add python.exe to PATH" during install^) and run setup.bat again.
    pause
    exit /b 1
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if errorlevel 1 (
    echo.
    echo ERROR: Python 3.11 or newer is required.
    echo Install it from https://www.python.org/downloads/ and run setup.bat again.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo [ok] %%v

REM ---------- 2. Check Node 18+ ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js not found.
    echo Install Node.js 18 or newer ^(LTS^) from https://nodejs.org and run setup.bat again.
    pause
    exit /b 1
)
node -e "process.exit(parseInt(process.versions.node.split('.')[0], 10) >= 18 ? 0 : 1)"
if errorlevel 1 (
    echo.
    echo ERROR: Node.js 18 or newer is required.
    echo Install the LTS release from https://nodejs.org and run setup.bat again.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo [ok] Node %%v

REM ---------- 3. Backend: virtualenv + dependencies ----------
echo.
echo Installing backend dependencies...
if not exist "backend\.venv\Scripts\python.exe" (
    %PY% -m venv backend\.venv
    if errorlevel 1 (
        echo ERROR: Could not create the Python virtual environment.
        pause
        exit /b 1
    )
)
set "VENV_PY=%CD%\backend\.venv\Scripts\python.exe"
"%VENV_PY%" -m pip install --quiet --upgrade pip
"%VENV_PY%" -m pip install -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: Backend dependency installation failed - see messages above.
    pause
    exit /b 1
)
echo [ok] Backend dependencies installed

REM ---------- 4. Frontend dependencies ----------
echo.
echo Installing frontend dependencies...
pushd frontend
call npm install
if errorlevel 1 (
    popd
    echo ERROR: Frontend dependency installation failed - see messages above.
    pause
    exit /b 1
)
popd
echo [ok] Frontend dependencies installed

REM ---------- 5. Environment file + generated credentials ----------
set "ADMIN_PASS="
if not exist "backend\.env" (
    copy /y "backend\.env.example" "backend\.env" >nul
    REM Generate a random SECRET_KEY and ADMIN_PASSWORD (via Python's
    REM secrets module - no %RANDOM% involved) and write them into .env.
    REM Only the password is printed back so we can show it once, below.
    for /f "delims=" %%p in ('"%VENV_PY%" -c "import pathlib,secrets,string; p=pathlib.Path('backend/.env'); ls=p.read_text(encoding='utf-8').splitlines(); pw=''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(14)); ls=['SECRET_KEY='+secrets.token_urlsafe(48) if l.startswith('SECRET_KEY=') else ('ADMIN_PASSWORD='+pw if l.startswith('ADMIN_PASSWORD=') else l) for l in ls]; p.write_text(chr(10).join(ls)+chr(10), encoding='utf-8'); print(pw)"') do set "ADMIN_PASS=%%p"
    echo [ok] Created backend\.env with a generated SECRET_KEY and admin password
) else (
    echo [ok] backend\.env already exists - leaving your credentials unchanged
)
set "ADMIN_EMAIL=admin@finalsaas.local"
for /f "tokens=2 delims==" %%e in ('findstr /b "ADMIN_EMAIL=" backend\.env') do set "ADMIN_EMAIL=%%e"

REM ---------- 6. Initialise database + seed demo data ----------
echo.
echo Initialising database and seeding demo agents...
pushd backend
".venv\Scripts\python.exe" -m app.seed
if errorlevel 1 (
    popd
    echo ERROR: Database seeding failed - see messages above.
    pause
    exit /b 1
)
popd
echo [ok] Database ready

REM ---------- 7. Done ----------
echo.
echo ============================================================
echo   SETUP COMPLETE - SAVE THESE ADMIN CREDENTIALS
echo ============================================================
echo   Login email:    %ADMIN_EMAIL%
if defined ADMIN_PASS (
    echo   Admin password: %ADMIN_PASS%
) else (
    echo   Admin password: ^(unchanged - it is the ADMIN_PASSWORD in backend\.env^)
)
echo.
echo   Next steps:
echo     1. Start everything:        start.bat
echo     2. Open the dashboard:      http://localhost:5173
echo     3. Log in with the credentials above.
echo.
echo   To make REAL phone calls you also need, in backend\.env:
echo     - VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER
echo     - SARVAM_API_KEY ^(or VOICE_PROVIDER=local, see docs\LOCAL_MODELS.md^)
echo     - PUBLIC_BASE_URL - a public https address for this laptop, e.g.:
echo           ngrok http 8001
echo       then copy its https URL into PUBLIC_BASE_URL.
echo       Without it, calls fail with PUBLIC_URL_NOT_CONFIGURED ^(by design^).
echo ============================================================
pause
endlocal
