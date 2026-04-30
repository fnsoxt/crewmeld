#!/bin/bash
# scripts/backup.sh
# CrewMeld database backup script

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/crewmeld-backup-${TIMESTAMP}.sql"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
echo "  Backup file: ${BACKUP_FILE}"

docker compose -f "$COMPOSE_FILE" exec -T db pg_dump \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-crewmeld}" \
  --no-owner \
  --no-privileges \
  --clean \
  > "$BACKUP_FILE"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup complete"
echo "  File size: ${FILE_SIZE}"
echo "  File path: ${BACKUP_FILE}"

# Keep the most recent 30 backups, delete older ones
cd "$BACKUP_DIR"
ls -t crewmeld-backup-*.sql 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "  Cleaned up backups older than the most recent 30"
