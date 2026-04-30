@echo off
setlocal

rem Crewmeld one-click startup
rem Usage: start.bat [docker compose flags]
rem Examples:
rem   start.bat
rem   start.bat --profile k3s --profile minio
rem   start.bat --profile k3s --profile minio --profile ragflow --profile ollama

rem Ensure .env exists (only copy if missing)
if not exist .env (
    echo [INFO] Creating .env from .env.example...
    if not exist .env.example (
        echo ERROR: .env.example not found, cannot bootstrap .env
        exit /b 1
    )
    copy .env.example .env >nul
) else (
    echo [INFO] .env already exists, skipping copy.
)

rem Phase 1: Generate secrets (idempotent)
echo [INFO] Ensuring secrets (docker compose --profile init run --rm setup)...
docker compose --profile init run --rm setup
if errorlevel 1 (
    echo ERROR: Secret generation failed. Check: docker compose logs setup
    exit /b 1
)

rem Phase 2: Start all services with user-supplied profile flags
echo [INFO] Starting services (docker compose %* up -d)...
docker compose %* up -d
if errorlevel 1 (
    echo ERROR: Service startup failed. Check: docker compose logs
    exit /b 1
)

echo.
echo [OK] Crewmeld is starting at http://localhost:6100
echo      Logs: docker compose logs -f crewmeld
echo      Stop: docker compose down

endlocal
exit /b 0
