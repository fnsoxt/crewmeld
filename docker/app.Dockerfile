# =============================================================================
# Crewmeld All-in-One Image
# Merges app + realtime + migrations + setup into single image.
# Roles differentiated at compose level via command override.
# =============================================================================

# ================ base ================
FROM oven/bun:1.3.9-slim AS base

ARG REGISTRY_MIRROR=""
ARG NPM_REGISTRY=""

RUN if [ -n "$REGISTRY_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${REGISTRY_MIRROR}|g" /etc/apt/sources.list.d/*.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org|${REGISTRY_MIRROR}|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv make g++ curl ca-certificates bash ffmpeg tini \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# ================ deps ================
FROM base AS deps
WORKDIR /app

RUN if [ -n "$NPM_REGISTRY" ]; then \
      bun config set registry "$NPM_REGISTRY"; \
    fi

COPY package.json bun.lock turbo.json ./
RUN mkdir -p apps packages/db packages/testing packages/logger packages/tsconfig
COPY apps/crewmeld/package.json ./apps/crewmeld/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json

RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    --mount=type=cache,id=npm-cache,target=/root/.npm \
    bun install -g turbo && \
    HUSKY=0 bun install --omit=dev --ignore-scripts --linker=hoisted

# ================ builder ================
FROM base AS builder
WORKDIR /app

RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install -g turbo

COPY --from=deps /app/node_modules ./node_modules

COPY package.json bun.lock turbo.json ./
COPY apps/crewmeld/package.json ./apps/crewmeld/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/logger/package.json ./packages/logger/package.json

COPY apps/crewmeld/next.config.ts ./apps/crewmeld/next.config.ts
COPY apps/crewmeld/tsconfig.json ./apps/crewmeld/tsconfig.json
COPY apps/crewmeld/tailwind.config.ts ./apps/crewmeld/tailwind.config.ts
COPY apps/crewmeld/postcss.config.mjs ./apps/crewmeld/postcss.config.mjs

COPY apps/crewmeld ./apps/crewmeld
COPY packages ./packages

WORKDIR /app/apps/crewmeld
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    HUSKY=0 bun install sharp --linker=hoisted

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1

WORKDIR /app

ARG DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}

ARG NEXT_PUBLIC_APP_URL="http://localhost:6100"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN bun run build

# Socket server bundle is produced locally by build.sh/bat/ps1 before docker
# build starts (bun build works poorly against hoisted monorepo node_modules
# inside docker). The bundle is platform-independent JS and gets picked up by
# the `COPY apps/crewmeld ./apps/crewmeld` above.
#
# Pre-build invariant: apps/crewmeld/socket-bundled.js must exist before
# `docker compose build crewmeld` or this builder stage will not have it to
# copy forward to runner.

# ================ runner ================
# Independent minimal base — do NOT inherit `base` stage (which carries
# python3 + make + g++ + nodejs ~1 GB that only builder needs).
FROM oven/bun:1.3.9-slim AS runner

ARG REGISTRY_MIRROR=""
RUN if [ -n "$REGISTRY_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${REGISTRY_MIRROR}|g" /etc/apt/sources.list.d/*.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org|${REGISTRY_MIRROR}|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi

# Runtime-only OS packages. NO python3/make/g++/nodejs here.
# - tini: PID 1 init (entrypoint)
# - bash: docker-entrypoint.sh is bash
# - ca-certificates: HTTPS to LLM providers
# (ffmpeg removed in R2: fluent-ffmpeg + ffmpeg-static both had 0 imports)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    tini bash ca-certificates

WORKDIR /app

ENV NODE_ENV=production \
    PORT=6100 \
    SOCKET_PORT=6102 \
    HOSTNAME="0.0.0.0"

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nextjs

# Next.js standalone (tracing produces self-contained app server.js + node_modules subset)
COPY --from=builder --chown=nextjs:nodejs /app/apps/crewmeld/public ./apps/crewmeld/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/crewmeld/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/crewmeld/.next/static ./apps/crewmeld/.next/static

# Socket bundled entry (self-contained via bun build; no monorepo node_modules required)
COPY --from=builder --chown=nextjs:nodejs /app/apps/crewmeld/socket-bundled.js ./apps/crewmeld/socket-bundled.js

# Native / external packages not traced by Next.js standalone.
# Keep in sync with next.config.ts:serverExternalPackages + dynamic import targets.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/unpdf ./node_modules/unpdf
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/iconv-lite ./node_modules/iconv-lite
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/ws ./node_modules/ws

# For scripts/run-migrations.ts (imports postgres directly)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

# For tiktoken (WASM tokenizer used by lib/knowledge/*); wasm must be loaded
# from node_modules at runtime — cannot be inlined by bun build.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/tiktoken ./node_modules/tiktoken

# Guardrails are optional (Python venv + validate_pii.py) — build only if present.
# Crewmeld does not currently bundle guardrails; keep the block so future ports
# work without Dockerfile churn.
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ -f ./apps/crewmeld/lib/guardrails/requirements.txt ]; then \
      python3 -m venv ./apps/crewmeld/lib/guardrails/venv && \
      ./apps/crewmeld/lib/guardrails/venv/bin/pip install --upgrade pip && \
      ./apps/crewmeld/lib/guardrails/venv/bin/pip install -r ./apps/crewmeld/lib/guardrails/requirements.txt && \
      chown -R nextjs:nodejs /app/apps/crewmeld/lib/guardrails; \
    else \
      echo "[Dockerfile] guardrails not present, skipping venv setup"; \
    fi

# Scripts used by setup / migrations / entrypoint / k3s-init
COPY --chown=nextjs:nodejs scripts/ensure-secrets.ts ./scripts/ensure-secrets.ts
COPY --chown=nextjs:nodejs scripts/run-migrations.ts ./scripts/run-migrations.ts
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --chown=nextjs:nodejs scripts/k3s-init.sh ./scripts/k3s-init.sh
COPY --chown=nextjs:nodejs scripts/k8s-rbac.yaml ./scripts/k8s-rbac.yaml

RUN chmod +x ./scripts/docker-entrypoint.sh ./scripts/k3s-init.sh

USER nextjs
RUN mkdir -p apps/crewmeld/.next/cache

EXPOSE 6100 6102

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["bunx", "concurrently", "-n", "App,Socket", "-c", "cyan,magenta", \
     "bun apps/crewmeld/server.js", \
     "bun apps/crewmeld/socket-bundled.js"]
