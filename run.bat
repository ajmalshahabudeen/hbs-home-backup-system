@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

REM =============================================================================
REM  HBS Home Backup System - Windows launcher
REM  Double-click friendly. Window always stays open at the end.
REM =============================================================================

cd /d "%~dp0" 2>nul
if errorlevel 1 (
  echo [error] Cannot cd to script folder.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

set "FORCE_BUILD=0"
if /i "%~1"=="FORCE" set "FORCE_BUILD=1"

echo.
echo   ============================================================
echo      HBS Home Backup System
echo   ============================================================
echo.

REM ----- Prefer Git Bash (full run.sh launcher) -----
set "BASH_EXE="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE (
  where bash >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%B in ('where bash 2^>nul') do (
      if not defined BASH_EXE set "BASH_EXE=%%B"
    )
  )
)

if defined BASH_EXE (
  echo [ ok ] Using bash: !BASH_EXE!
  echo.
  if "!FORCE_BUILD!"=="1" (
    "!BASH_EXE!" -c "export FORCE_BUILD=1; exec bash ./run.sh"
  ) else (
    "!BASH_EXE!" ./run.sh
  )
  set "RC=!ERRORLEVEL!"
  goto FINISH
)

echo [warn] Git Bash not found - using simple Docker fallback.
echo         Install Git for Windows for the full launcher.
echo.

REM ----- Load .env (KEY=VALUE lines; skip comments) -----
if exist ".env" (
  echo [ ok ] Loading .env
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    if not "%%~A"=="" set "%%~A=%%~B"
  )
) else (
  echo [warn] No .env file. Copy .env.example to .env
)

if not defined APP_PORT set "APP_PORT=38480"
if not defined HOST_STORAGE_PATH set "HOST_STORAGE_PATH=.\data\storage"

REM Normalize storage path via PowerShell (safe for drive letters)
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p=$env:HOST_STORAGE_PATH; if(-not $p){$p='.\data\storage'}; $p=$p.Trim().Trim([char]34).Replace([char]92,'/'); if($p -match '^[A-Za-z]:/?$'){ $d=$p.Substring(0,1).ToUpper(); $p=$d + ':/HBS-Backups' }; Write-Output $p"`) do set "HOST_STORAGE_PATH=%%P"

set "APP_URL=http://127.0.0.1:!APP_PORT!"
set "HEALTH_URL=http://127.0.0.1:!APP_PORT!/api/health"

echo [hbs] App URL:  !APP_URL!
echo [hbs] Storage:  !HOST_STORAGE_PATH!

REM Create storage folder on Windows
powershell -NoProfile -Command "$p=$env:HOST_STORAGE_PATH; if(-not $p){exit 0}; $win=$p -replace '/','\'; if(-not (Test-Path -LiteralPath $win)){ New-Item -ItemType Directory -Path $win -Force | Out-Null }"

where docker >nul 2>&1
if errorlevel 1 (
  echo [error] Docker not found on PATH. Install Docker Desktop.
  set "RC=1"
  goto FINISH
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [error] Docker daemon not running. Start Docker Desktop.
  set "RC=1"
  goto FINISH
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo [error] docker compose not available.
  set "RC=1"
  goto FINISH
)

if not exist "docker-compose.yml" (
  echo [error] Missing docker-compose.yml
  set "RC=1"
  goto FINISH
)

echo [hbs] Starting stack...
if "!FORCE_BUILD!"=="1" (
  docker compose --env-file .env up -d --build --force-recreate
) else (
  docker compose --env-file .env up -d --build
)
if errorlevel 1 (
  echo [warn] compose up failed — purging BuildKit cache and retrying fresh rebuild...
  docker builder prune -af >nul 2>&1
  docker compose --env-file .env build --no-cache
  docker compose --env-file .env up -d --force-recreate
  if errorlevel 1 (
    echo [error] docker compose failed after cache purge.
    echo         Try: docker compose logs
    set "RC=1"
    goto FINISH
  )
)

echo [hbs] Waiting for health...
set /a I=1

:health_loop
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri 'http://127.0.0.1:%APP_PORT%/api/health'; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 300){exit 0}else{exit 1} } catch { exit 1 }"
if not errorlevel 1 goto healthy
timeout /t 2 /nobreak >nul
set /a I+=1
if !I! LEQ 90 goto health_loop
echo [error] Health check failed.
docker compose logs --tail 40 server
set "RC=1"
goto FINISH

:healthy
echo [ ok ] App is healthy.
start "" "http://127.0.0.1:!APP_PORT!"
echo.
echo ============================================================
echo   HBS is ready
echo ============================================================
echo   Admin UI     http://127.0.0.1:!APP_PORT!
echo   Login        http://127.0.0.1:!APP_PORT!/login
echo   Register     http://127.0.0.1:!APP_PORT!/register
echo   Health       http://127.0.0.1:!APP_PORT!/api/health
echo   Storage      !HOST_STORAGE_PATH! -^> /data/storage
echo.
echo   Logs:    docker compose logs -f server
echo   Worker:  docker compose logs -f worker
echo   Stop:    docker compose down
echo ============================================================
set "RC=0"

:FINISH
echo.
if defined RC (
  if not "!RC!"=="0" echo [error] Exit code: !RC!
)
echo Press any key to close this window...
pause >nul
if defined RC exit /b !RC!
exit /b 0
