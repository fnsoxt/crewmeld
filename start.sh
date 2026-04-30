#!/usr/bin/env bash
#
# Crewmeld one-click startup
#
# Usage: ./start.sh [docker compose flags]
# Examples:
#   ./start.sh
#   ./start.sh --profile k3s --profile minio
#   ./start.sh --profile k3s --profile minio --profile ragflow --profile ollama

set -euo pipefail

# Ensure .env exists (only copy if missing)
if [[ ! -f .env ]]; then
    echo "[INFO] Creating .env from .env.example..."
    if [[ ! -f .env.example ]]; then
        echo "ERROR: .env.example not found, cannot bootstrap .env" >&2
        exit 1
    fi
    cp .env.example .env
else
    echo "[INFO] .env already exists, skipping copy."
fi

# Phase 1: Generate secrets (idempotent — skips if already filled)
echo "[INFO] Ensuring secrets (docker compose --profile init run --rm setup)..."
docker compose --profile init run --rm setup

# Phase 2: Start all services with user-supplied profile flags
echo "[INFO] Starting services (docker compose $* up -d)..."
docker compose "$@" up -d

echo ""
echo "[OK] Crewmeld is starting at ${NEXT_PUBLIC_APP_URL:-http://localhost:6100}"
echo "     Logs: docker compose logs -f crewmeld"
echo "     Stop: docker compose down"
