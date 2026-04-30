#!/bin/bash
# scripts/generate-self-signed-cert.sh
# Generate a self-signed SSL certificate (for internal/testing environments)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a

CERT_DIR="${SSL_CERT_DIR:-${PROJECT_ROOT}/certs}"
DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
  read -p "Enter domain (e.g. crewmeld.company.com): " DOMAIN
fi

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Error: domain is required${NC}"
  echo "Usage: bash scripts/generate-self-signed-cert.sh <domain>"
  exit 1
fi

mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate..."
echo "  Domain: ${DOMAIN}"
echo "  Output directory: ${CERT_DIR}"

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "${CERT_DIR}/cert.key" \
  -out "${CERT_DIR}/cert.crt" \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN}"

chmod 644 "${CERT_DIR}/cert.crt"
chmod 600 "${CERT_DIR}/cert.key"

echo ""
echo -e "${GREEN}Certificate generated successfully!${NC}"
echo "  Certificate: ${CERT_DIR}/cert.crt"
echo "  Private key: ${CERT_DIR}/cert.key"
echo "  Validity: 365 days"
echo ""
echo "  Note: Self-signed certificates are only suitable for internal or testing environments."
echo "  For production, use Let's Encrypt or a commercial certificate."
