#!/bin/bash
# scripts/health-check.sh
# CrewMeld health-check script (outputs JSON)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_URL="${APP_URL:-http://localhost}"

check_container() {
  local NAME=$1
  local STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format json "$NAME" 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$STATUS" ]; then
    STATUS="not_found"
  fi
  echo "$STATUS"
}

check_api() {
  local URL=$1
  local HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "ok"
  else
    echo "error (HTTP $HTTP_CODE)"
  fi
}

NGINX_STATUS=$(check_container "nginx")
CREWMELD_STATUS=$(check_container "crewmeld")
REALTIME_STATUS=$(check_container "realtime")
DB_STATUS=$(check_container "db")
REDIS_STATUS=$(check_container "redis")
RAGFLOW_STATUS=$(check_container "ragflow")

HEALTH_API=$(check_api "${APP_URL}/api/health")
READY_API=$(check_api "${APP_URL}/api/ready")

ALL_OK="true"
for STATUS in "$NGINX_STATUS" "$CREWMELD_STATUS" "$DB_STATUS" "$REDIS_STATUS"; do
  if [ "$STATUS" != "healthy" ]; then
    ALL_OK="false"
    break
  fi
done

cat <<JSONEOF
{
  "status": $([ "$ALL_OK" = "true" ] && echo '"healthy"' || echo '"unhealthy"'),
  "containers": {
    "nginx": "$NGINX_STATUS",
    "crewmeld": "$CREWMELD_STATUS",
    "realtime": "$REALTIME_STATUS",
    "db": "$DB_STATUS",
    "redis": "$REDIS_STATUS",
    "ragflow": "$RAGFLOW_STATUS"
  },
  "endpoints": {
    "health": "$HEALTH_API",
    "ready": "$READY_API"
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONEOF
