# syntax=docker/dockerfile:1

# Monorepo build for apps/server (Next.js standalone) + workspace packages
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUN_INSTALL=/root/.bun \
    PATH="/root/.bun/bin:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash

FROM base AS builder
# Workspace manifests
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/webapp/package.json ./apps/webapp/
COPY apps/mobile-app/package.json ./apps/mobile-app/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config

# Sources required before install so prisma postinstall / workspace links work
COPY packages/db ./packages/db
COPY packages/auth ./packages/auth
COPY packages/ui ./packages/ui
COPY apps/server ./apps/server

# IMPORTANT: do NOT bake NEXT_PUBLIC_APP_URL=http://localhost here.
# That forces the browser bundle to call localhost even when the user opens
# the app via a LAN IP (http://192.168.x.x:38480) → CORS failure.
ENV DATABASE_URL="postgresql://hbs:hbs@localhost:5432/hbs_backup?schema=public" \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN bun install --frozen-lockfile || bun install

WORKDIR /app/packages/db
RUN bunx prisma generate

WORKDIR /app/apps/server
# Real Node binary (not bun's node shim)
RUN /usr/local/bin/node ./node_modules/next/dist/bin/next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=38480 \
    HOSTNAME=0.0.0.0 \
    STORAGE_ROOT=/data/storage \
    NEXT_TELEMETRY_DISABLED=1 \
    BUN_INSTALL=/root/.bun \
    PATH="/root/.bun/bin:$PATH" \
    PYTHON_BIN=python3 \
    PYTHON_SCRIPTS_DIR=/app/python \
    QUEUE_BACKEND=celery \
    BETTER_AUTH_STRICT_ORIGINS=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates openssl curl unzip \
    python3 python3-pip python3-venv \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/storage/users \
  && chmod -R 777 /data/storage \
  && curl -fsSL https://bun.sh/install | bash

# Standalone Next output (monorepo → apps/server/server.js)
COPY --from=builder /app/apps/server/.next/standalone ./
COPY --from=builder /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder /app/apps/server/public ./apps/server/public

# Prisma schema + generated client for boot database sync
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/generated ./packages/db/generated
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/package.json ./package.json

# Python enqueue client (same scripts as worker; needs celery+redis+psycopg)
COPY python /app/python
RUN pip3 install --break-system-packages --no-cache-dir -r /app/python/requirements.txt \
  && chmod +x /app/python/enqueue_job.py /app/python/worker-entrypoint.sh /app/python/beat-entrypoint.sh \
  && sed -i 's/\r$//' /app/python/*.sh /app/python/enqueue_job.py || true

COPY apps/server/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
  && sed -i 's/\r$//' /app/docker-entrypoint.sh

EXPOSE 38480
VOLUME ["/data/storage"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
