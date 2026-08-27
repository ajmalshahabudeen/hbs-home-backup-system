#!/usr/bin/env bash
set -euo pipefail

c() { printf '\033[1;36m%s\033[0m\n' "$1"; }
d() { printf '\033[90m%s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
err() { printf '\033[1;31m%s\033[0m\n' "$1"; }

c ""
c "  ╔══════════════════════════════════════════════════════════╗"
c "  ║              HBS CLOUD  ·  container boot                ║"
c "  ╚══════════════════════════════════════════════════════════╝"
d "  STORAGE_ROOT=${STORAGE_ROOT:-/data/storage}"
d "  PORT=${PORT:-38480}"
if [[ -n "${GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  ok "  google oauth: configured"
else
  warn "  google oauth: missing (set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in apps/server/.env)"
fi

DB_HOST_HINT="$(echo "${DATABASE_URL:-}" | sed -E 's#.*@([^/:]+).*#\1#' || true)"
d "  DATABASE host=${DB_HOST_HINT:-unknown}"

STORAGE_ROOT="${STORAGE_ROOT:-/data/storage}"
mkdir -p "$STORAGE_ROOT/users"
if ! touch "$STORAGE_ROOT/.hbs-write-probe" 2>/dev/null; then
  err "  ERROR: storage root is not writable: $STORAGE_ROOT"
  err "  Set HOST_STORAGE_PATH in .env (e.g. F:/ or /mnt/data)"
  exit 1
fi
rm -f "$STORAGE_ROOT/.hbs-write-probe"
ok "  storage OK → $STORAGE_ROOT"

wait_for_pg() {
  local i host port
  host="${DB_HOST_HINT:-postgres}"
  port=5432
  if command -v node >/dev/null 2>&1; then
    for i in $(seq 1 60); do
      if node -e '
        const net = require("node:net");
        const host = process.env.PGHOST || "postgres";
        const port = Number(process.env.PGPORT || 5432);
        const s = net.connect({ host, port }, () => { s.end(); process.exit(0); });
        s.on("error", () => process.exit(1));
        setTimeout(() => process.exit(1), 2000);
      ' 2>/dev/null; then
        return 0
      fi
      sleep 2
    done
    return 1
  fi

  # fallback: bash /dev/tcp
  for i in $(seq 1 60); do
    if (echo >/dev/tcp/${host}/${port}) >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  export PGHOST="${DB_HOST_HINT:-postgres}"
  export PGPORT=5432
  d "  waiting for postgres at ${PGHOST}:${PGPORT}..."
  if ! wait_for_pg; then
    err "  ERROR: postgres did not become ready"
    exit 1
  fi
  ok "  postgres is up"

  d "  applying schema..."
  cd /app/packages/db
  if command -v npx >/dev/null 2>&1; then
    npx --yes prisma@7.9.1 db push --schema=./prisma/schema.prisma --url "$DATABASE_URL" --accept-data-loss || true
  fi
  cd /app
fi

ok "  starting Next.js on :${PORT:-38480}  (tagged request logs enabled)"
d "  tags: [REQ] [RES] [AUTH] [FN] [FS] [DB] [REDIS] [QUEUE] [PY] [MEDIA] [JOB]"
export PORT="${PORT:-38480}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export FORCE_COLOR="${FORCE_COLOR:-1}"
export HBS_LOG_COLOR="${HBS_LOG_COLOR:-1}"
export HBS_LOG_LEVEL="${HBS_LOG_LEVEL:-trace}"

if [[ -f /app/apps/server/server.js ]]; then
  exec node /app/apps/server/server.js
elif [[ -f /app/server.js ]]; then
  exec node /app/server.js
else
  err "  ERROR: standalone server.js not found"
  ls -la /app /app/apps/server 2>/dev/null || true
  exit 1
fi
