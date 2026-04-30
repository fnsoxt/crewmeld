#!/usr/bin/env bash
#
# Build crewmeld Docker image with versioned + latest tags.
#
# Usage:
#   ./build.sh <version>            Build image tagged <version> + latest
#   ./build.sh <version> --push     Build + push both tags to registry
#
# Produces: proinsight/crewmeld:<version>
#           proinsight/crewmeld:latest

set -euo pipefail

VERSION="${1:-}"
PUSH_FLAG="${2:-}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version> [--push|-p]"
    echo "Example: $0 1.0.0"
    echo "         $0 1.0.0 --push"
    exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: version must be semantic format x.y.z (got: $VERSION)" >&2
    exit 1
fi

IMAGE="proinsight/crewmeld"

PUSH=0
if [[ "$PUSH_FLAG" == "--push" || "$PUSH_FLAG" == "-p" ]]; then
    PUSH=1
fi

echo "[build.sh] Bundling socket server (bun build)..."
(cd apps/crewmeld && bun run build:socket)

echo "[build.sh] Building ${IMAGE}:${VERSION}"
export VERSION
docker compose build crewmeld

echo "[build.sh] Tagging ${IMAGE}:${VERSION} as ${IMAGE}:latest"
docker tag "${IMAGE}:${VERSION}" "${IMAGE}:latest"

if [[ "$PUSH" -eq 1 ]]; then
    echo "[build.sh] Pushing ${IMAGE}:${VERSION}"
    docker push "${IMAGE}:${VERSION}"
    echo "[build.sh] Pushing ${IMAGE}:latest"
    docker push "${IMAGE}:latest"
    echo "[build.sh] Done: built + tagged + pushed ${IMAGE}:${VERSION} / :latest"
else
    echo "[build.sh] Done: built + tagged ${IMAGE}:${VERSION} / :latest (not pushed)"
    echo "[build.sh] To push: $0 $VERSION --push"
fi
