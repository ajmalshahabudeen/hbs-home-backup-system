#!/usr/bin/env bash
set -euo pipefail

echo "[hbs-server] boot"
echo "[hbs-server] STORAGE_ROOT=${STORAGE_ROOT:-/data/storage}"

DB_HOST_HINT="$(echo "${DATABASE_URL:-}" | sed -E 's#.*@([^/:]+).*#\1#' || true)"
echo "[hbs-server] DATABASE host=${DB_HOST_HINT:-unknown}"

STORAGE_ROOT="${STORAGE_ROOT:-/data/storage}"
mkdir -p "$STORAGE_ROOT/users"
if ! touch "$STORAGE_ROOT/.hbs-write-probe" 2>/dev/null; then
  echo "[hbs-server] ERROR: storage root is not writable: $STORAGE_ROOT" >&2
  echo "[hbs-server] Set HOST_STORAGE_PATH in .env (e.g. F:/ or /mnt/data)" >&2
  exit 1
fi
rm -f "$STORAGE_ROOT/.hbs-write-probe"
echo "[hbs-server] storage OK → $STORAGE_ROOT"

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
  echo "[hbs-server] waiting for postgres at ${PGHOST}:${PGPORT}..."
  if ! wait_for_pg; then
    echo "[hbs-server] ERROR: postgres did not become ready" >&2
    exit 1
  fi
  echo "[hbs-server] postgres is up"

  echo "[hbs-server] applying schema..."
  cd /app/packages/db
  if command -v npx >/dev/null 2>&1; then
    npx --yes prisma@7.9.1 db push --schema=./prisma/schema.prisma --url "$DATABASE_URL" --accept-data-loss || true
  fi
  cd /app
fi

echo "[hbs-server] starting Next.js on :${PORT:-38480}"
export PORT="${PORT:-38480}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

if [[ -f /app/apps/server/server.js ]]; then
  exec node /app/apps/server/server.js
elif [[ -f /app/server.js ]]; then
  exec node /app/server.js
else
  echo "[hbs-server] ERROR: standalone server.js not found" >&2
  ls -la /app /app/apps/server 2>/dev/null || true
  exit 1
fi
