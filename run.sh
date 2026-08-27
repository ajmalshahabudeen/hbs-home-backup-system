#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# HBS Home Backup System — Linux / macOS / Git Bash launcher
#
# Starts Postgres (persistent) + Admin Server via Docker Compose.
# - Checks Docker CLI + daemon (with retries)
# - Ensures HOST_STORAGE_PATH exists / is usable
# - Fingerprints sources → rebuild when code changes
# - Waits for /api/health then opens the browser
# -----------------------------------------------------------------------------
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR" || exit 1

APP_NAME="hbs-home-backup"
SERVER_CONTAINER="hbs-server"
POSTGRES_CONTAINER="hbs-postgres"
APP_PORT="${APP_PORT:-38480}"
APP_URL="${APP_URL:-http://127.0.0.1:${APP_PORT}}"
HEALTH_URL="${HEALTH_URL:-${APP_URL}/api/health}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
FP_FILE="${FP_FILE:-.docker-build-fingerprint}"
FORCE_BUILD="${FORCE_BUILD:-0}"
ENV_FILE="${ENV_FILE:-.env}"

DOCKER_READY_RETRIES="${DOCKER_READY_RETRIES:-30}"
DOCKER_READY_SLEEP="${DOCKER_READY_SLEEP:-2}"
START_RETRIES="${START_RETRIES:-3}"
HEALTH_RETRIES="${HEALTH_RETRIES:-90}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"

NEED_BUILD=0
NEED_RECREATE=0
CODE_CHANGED=0
CURRENT_FP=""
STORED_FP=""

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
  C_MAGENTA=$'\033[35m'
else
  C_RESET=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_MAGENTA=""
fi

log()  { printf '%s[%s]%s %s\n' "$C_CYAN" "$APP_NAME" "$C_RESET" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf '%s[error]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

banner() {
  printf '%s\n' "${C_MAGENTA}${C_BOLD}"
  cat <<'EOF'
  _  _ ___ ___   _  _  ___  __  __ ___
 | || | _ ) __| | || |/ _ \|  \/  | __|
 | __ | _ \__ \ | __ | (_) | |\/| | _|
 |_||_|___/___/ |_||_|\___/|_|  |_|___|
      Home Backup System · Admin Server
EOF
  printf '%s\n' "${C_RESET}"
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    ok "Loaded ${ENV_FILE}"
  else
    warn "No ${ENV_FILE} — using defaults. Copy .env.example → .env"
  fi
  APP_PORT="${APP_PORT:-38480}"
  APP_URL="${APP_URL:-http://127.0.0.1:${APP_PORT}}"
  HEALTH_URL="${HEALTH_URL:-${APP_URL}/api/health}"
  HOST_STORAGE_PATH="${HOST_STORAGE_PATH:-./data/storage}"
  normalize_host_storage
  detect_lan_hostname
}

# Normalize Windows drive letters so Docker Compose bind mounts work.
# Short form "G:\:/data/storage" breaks with "too many colons".
# Prefer G:/HBS-Backups (folder) over bare G: (whole drive).
normalize_host_storage() {
  local p="${HOST_STORAGE_PATH:-./data/storage}"

  # Strip surrounding quotes
  p="${p%\"}"
  p="${p#\"}"
  p="${p%\'}"
  p="${p#\'}"

  # Backslashes → forward slashes (Docker Desktop prefers G:/path)
  p="${p//\\//}"

  # Bare drive letter: G: or G:/  →  G:/HBS-Backups (safer than whole drive)
  if [[ "$p" =~ ^[A-Za-z]:/?$ ]]; then
    local drive
    drive="$(echo "${p:0:1}" | tr '[:lower:]' '[:upper:]')"
    p="${drive}:/HBS-Backups"
    warn "HOST_STORAGE_PATH was a bare drive letter — using folder: ${p}"
    warn "Change .env to HOST_STORAGE_PATH=${p} (forward slashes) to silence this."
  fi

  # Drive + path with mixed separators already handled; ensure G:/foo form
  if [[ "$p" =~ ^[A-Za-z]:/.+ ]]; then
    local drive
    drive="$(echo "${p:0:1}" | tr '[:lower:]' '[:upper:]')"
    p="${drive}:${p:2}"
  fi

  # Collapse duplicate slashes (but keep // for UNC if ever used)
  if [[ "$p" != //* ]]; then
    p="$(echo "$p" | sed -E 's|/+|/|g')"
  fi

  HOST_STORAGE_PATH="$p"
  export HOST_STORAGE_PATH
  log "Normalized HOST_STORAGE_PATH=${HOST_STORAGE_PATH}"
}

detect_lan_hostname() {
  if [[ -n "${HBS_HOSTNAME:-}" ]]; then
    export HBS_HOSTNAME
    ok "LAN hostname (env): ${HBS_HOSTNAME}"
    return
  fi
  local mdns=""
  if command -v python >/dev/null 2>&1; then
    mdns="$(python "$ROOT_DIR/python/get_hostname.py" 2>/dev/null | sed -n 's/.*"mdns":"\([^"]*\)".*/\1/p')"
  elif command -v python3 >/dev/null 2>&1; then
    mdns="$(python3 "$ROOT_DIR/python/get_hostname.py" 2>/dev/null | sed -n 's/.*"mdns":"\([^"]*\)".*/\1/p')"
  fi
  if [[ -z "$mdns" ]]; then
    local hn
    hn="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '\r')"
    hn="${hn%%.*}"
    if [[ -n "$hn" && "$hn" != "localhost" ]]; then
      mdns="${hn}.local"
    fi
  fi
  HBS_HOSTNAME="${mdns:-zoro.local}"
  export HBS_HOSTNAME
  ok "LAN hostname: ${HBS_HOSTNAME}"
}

ensure_storage() {
  local p="$HOST_STORAGE_PATH"
  log "Storage path (HOST_STORAGE_PATH): ${p}"

  # Create relative paths and Windows drive folders (G:/HBS-Backups)
  if [[ "$p" == ./* || "$p" == ../* ]]; then
    mkdir -p "$p" 2>/dev/null || true
  elif [[ "$p" =~ ^[A-Za-z]:/ ]]; then
    # Git Bash understands /g/HBS-Backups and G:/HBS-Backups
    mkdir -p "$p" 2>/dev/null || true
    # Also try MSYS path /g/...
    local drive rest msys
    drive="$(echo "${p:0:1}" | tr '[:upper:]' '[:lower:]')"
    rest="${p:2}"
    msys="/${drive}${rest}"
    mkdir -p "$msys" 2>/dev/null || true
  elif [[ "$p" == /* ]]; then
    mkdir -p "$p" 2>/dev/null || true
  fi

  if [[ ! -e "$p" ]]; then
    if ! mkdir -p "$p" 2>/dev/null; then
      # Last try via cmd on Windows
      if command -v cmd.exe >/dev/null 2>&1 && [[ "$p" =~ ^[A-Za-z]:/ ]]; then
        local winp="${p////\\}"
        cmd.exe /c "if not exist \"${winp}\" mkdir \"${winp}\"" >/dev/null 2>&1 || true
      fi
    fi
  fi

  if [[ ! -e "$p" ]]; then
    # Check msys path
    local drive rest msys
    if [[ "$p" =~ ^[A-Za-z]:/ ]]; then
      drive="$(echo "${p:0:1}" | tr '[:upper:]' '[:lower:]')"
      rest="${p:2}"
      msys="/${drive}${rest}"
      if [[ -e "$msys" ]]; then
        ok "Storage exists at ${msys}"
        return 0
      fi
    fi
    die "HOST_STORAGE_PATH does not exist and could not be created: $p
  Windows example: HOST_STORAGE_PATH=G:/HBS-Backups
  Linux example:   HOST_STORAGE_PATH=/mnt/data/hbs
  (Use forward slashes. Do NOT set bare G:\\ — that breaks Docker mounts.)"
  fi

  if [[ -d "$p" ]] && touch "$p/.hbs-write-probe" 2>/dev/null; then
    rm -f "$p/.hbs-write-probe"
    ok "Storage is writable."
  else
    warn "Storage may not be writable from host shell — Docker mount will still be attempted."
  fi
}

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    return 1
  fi
}

compose() {
  if [[ -f "$ENV_FILE" ]]; then
    "${COMPOSE[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" "$@"
  fi
}

http_ok() {
  local url="$1"
  local code=""
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    [[ "$code" =~ ^2[0-9][0-9]$ ]] && return 0
    return 1
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q --timeout=5 -O /dev/null "$url" 2>/dev/null && return 0
  fi
  return 1
}

wait_for_docker() {
  log "Checking Docker CLI..."
  command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH. Install Docker Desktop / Engine first."

  log "Waiting for Docker daemon (up to $((DOCKER_READY_RETRIES * DOCKER_READY_SLEEP))s)..."
  local i=1
  while (( i <= DOCKER_READY_RETRIES )); do
    if docker info >/dev/null 2>&1; then
      ok "Docker daemon is running."
      return 0
    fi
    warn "Docker not ready yet (attempt ${i}/${DOCKER_READY_RETRIES}) — start Docker Desktop?"
    sleep "$DOCKER_READY_SLEEP"
    ((i++)) || true
  done
  die "Docker daemon did not become ready."
}

container_running() {
  local name="$1"
  local status
  status="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)"
  [[ "$status" == "true" ]]
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

list_fingerprint_files() {
  local f
  for f in \
    docker-compose.yml \
    apps/server/Dockerfile \
    apps/server/docker-entrypoint.sh \
    apps/server/package.json \
    apps/server/next.config.ts \
    package.json \
    bun.lock \
    packages/db/prisma/schema.prisma \
    packages/db/package.json \
    packages/auth/auth.ts \
    packages/auth/package.json \
    python/Dockerfile \
    python/requirements.txt \
    python/enqueue_job.py \
    python/worker-entrypoint.sh \
    python/beat-entrypoint.sh
  do
    [[ -f "$f" ]] && printf '%s\n' "$f"
  done
  if command -v find >/dev/null 2>&1; then
    find apps/server packages/db packages/auth packages/ui python \
      \( -name node_modules -o -name .next -o -name generated -o -name __pycache__ \) -prune -o \
      -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.css' -o -name '*.prisma' -o -name '*.py' -o -name '*.sh' \) \
      -print 2>/dev/null | sort
  fi
}

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    cksum | awk '{print $1"-"$2}'
  fi
}

compute_fingerprint() {
  local tmp
  tmp="$(mktemp 2>/dev/null || echo ".fp-manifest.$$")"
  {
    list_fingerprint_files | while IFS= read -r f; do
      [[ -f "$f" ]] || continue
      if command -v sha256sum >/dev/null 2>&1; then
        printf '%s %s\n' "$f" "$(sha256sum "$f" | awk '{print $1}')"
      elif command -v shasum >/dev/null 2>&1; then
        printf '%s %s\n' "$f" "$(shasum -a 256 "$f" | awk '{print $1}')"
      else
        printf '%s %s\n' "$f" "$(wc -c <"$f" | tr -d ' ')"
      fi
    done
  } >"$tmp"
  CURRENT_FP="$(hash_stream <"$tmp")"
  rm -f "$tmp" 2>/dev/null || true
  [[ -n "$CURRENT_FP" ]] || CURRENT_FP="unknown"
}

load_stored_fingerprint() {
  if [[ -f "$FP_FILE" ]]; then
    STORED_FP="$(tr -d '[:space:]' <"$FP_FILE" || true)"
  else
    STORED_FP=""
  fi
}

save_fingerprint() {
  printf '%s\n' "$CURRENT_FP" >"$FP_FILE"
  ok "Saved build fingerprint → ${FP_FILE}"
}

detect_code_change() {
  compute_fingerprint
  load_stored_fingerprint
  log "Code fingerprint: ${CURRENT_FP:0:12}…"
  if [[ -n "$STORED_FP" ]]; then
    log "Last built:       ${STORED_FP:0:12}…"
  else
    log "Last built:       (none)"
  fi

  if [[ "$FORCE_BUILD" == "1" ]]; then
    CODE_CHANGED=1; NEED_BUILD=1; NEED_RECREATE=1
    warn "FORCE_BUILD=1 — rebuild + recreate"
    return
  fi
  if [[ -z "$STORED_FP" || "$STORED_FP" != "$CURRENT_FP" ]]; then
    CODE_CHANGED=1; NEED_BUILD=1; NEED_RECREATE=1
    warn "Sources changed — will rebuild"
    return
  fi
  CODE_CHANGED=0
  ok "Sources match last build."
}

start_stack() {
  local attempt=1
  local args=(up -d)
  export HBS_BUILD_FINGERPRINT="$CURRENT_FP"

  if (( NEED_BUILD )); then args+=(--build); fi
  if (( NEED_RECREATE )); then args+=(--force-recreate); fi

  if ! docker image ls --format '{{.Repository}}' 2>/dev/null | grep -qE 'hbs-home-backup|hbs-server' ; then
    # image name varies by compose project
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -qi hbs; then
      log "No HBS image found — building."
      args=(up -d --build)
      NEED_BUILD=1
    fi
  fi

  while (( attempt <= START_RETRIES )); do
    log "Compose up (attempt ${attempt}/${START_RETRIES}) → ${args[*]}"
    if compose "${args[@]}"; then
      ok "Compose up finished."
      save_fingerprint
      return 0
    fi
    warn "compose up failed — purging BuildKit cache and retrying fresh rebuild..."
    docker builder prune -af >/dev/null 2>&1 || true
    compose build --no-cache
    args=(up -d --force-recreate)
    NEED_BUILD=0
    NEED_RECREATE=1
    ((attempt++)) || true
    sleep 3
  done
  die "Failed to start stack. Try: docker compose logs"
}

ensure_running() {
  local i=1
  local max=30
  log "Verifying containers..."
  while (( i <= max )); do
    if container_running "$SERVER_CONTAINER" && container_running "$POSTGRES_CONTAINER"; then
      ok "postgres + server are running."
      return 0
    fi
    if container_exists "$SERVER_CONTAINER" && ! container_running "$SERVER_CONTAINER"; then
      warn "Starting stopped server..."
      docker start "$SERVER_CONTAINER" >/dev/null 2>&1 || compose up -d >/dev/null 2>&1 || true
    else
      compose up -d >/dev/null 2>&1 || true
    fi
    sleep 2
    ((i++)) || true
  done
  compose logs --tail 40 || true
  die "Containers not running."
}

wait_for_health() {
  log "Waiting for health at ${HEALTH_URL} (up to $((HEALTH_RETRIES * HEALTH_SLEEP))s)..."
  local i=1
  while (( i <= HEALTH_RETRIES )); do
    if http_ok "$HEALTH_URL"; then
      ok "App is healthy."
      return 0
    fi
    if (( i % 15 == 0 )) && ! container_running "$SERVER_CONTAINER"; then
      warn "Server stopped during health wait — restarting..."
      compose up -d >/dev/null 2>&1 || true
    fi
    printf '  … not ready yet (%s/%s)\r' "$i" "$HEALTH_RETRIES"
    sleep "$HEALTH_SLEEP"
    ((i++)) || true
  done
  printf '\n'
  compose logs --tail 60 server || true
  die "Health check failed: ${HEALTH_URL}"
}

open_browser() {
  local url="$1"
  log "Opening ${url}"
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 || true
  elif command -v cmd.exe >/dev/null 2>&1; then
    MSYS_NO_PATHCONV=1 cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  else
    warn "Could not auto-open browser. Visit: $url"
  fi
}

print_summary() {
  local status="up-to-date"
  (( CODE_CHANGED || NEED_BUILD )) && status="rebuilt"
  cat <<EOF

${C_BOLD}${C_GREEN}════════════════════════════════════════════════════${C_RESET}
${C_BOLD}  HBS is ready${C_RESET}
${C_GREEN}════════════════════════════════════════════════════${C_RESET}

  ${C_CYAN}Admin UI${C_RESET}     ${APP_URL}
  ${C_CYAN}Login${C_RESET}        ${APP_URL}/login
  ${C_CYAN}Register${C_RESET}     ${APP_URL}/register  ${C_YELLOW}(first user = admin)${C_RESET}
  ${C_CYAN}Health${C_RESET}       ${HEALTH_URL}
  ${C_CYAN}Storage${C_RESET}      ${HOST_STORAGE_PATH}  →  /data/storage
  ${C_CYAN}Postgres${C_RESET}     localhost:${POSTGRES_PORT:-5432}  (volume: hbs_postgres_data)
  ${C_CYAN}Redis${C_RESET}        localhost:${REDIS_PORT:-6380}  (volume: hbs_redis_data)
  ${C_CYAN}Fingerprint${C_RESET}  ${CURRENT_FP:0:12}…  (${status})

  ${C_BOLD}Useful commands${C_RESET}
    docker compose logs -f server
    docker compose logs -f worker
    docker compose down          # stop (keeps DB volume)
    docker compose down -v       # stop + WIPE database volume
    FORCE_BUILD=1 ./run.sh       # force rebuild

${C_GREEN}════════════════════════════════════════════════════${C_RESET}

EOF
}

main() {
  banner
  load_env
  ensure_storage
  wait_for_docker
  [[ -f "$COMPOSE_FILE" ]] || die "Missing ${COMPOSE_FILE}"
  resolve_compose || die "Neither 'docker compose' nor 'docker-compose' found."
  ok "Using: ${COMPOSE[*]}"

  # Fast path
  detect_code_change
  if container_running "$SERVER_CONTAINER" && container_running "$POSTGRES_CONTAINER" && (( ! CODE_CHANGED )) && http_ok "$HEALTH_URL"; then
    ok "Stack already healthy — fast path."
    open_browser "$APP_URL"
    print_summary
    exit 0
  fi

  if (( CODE_CHANGED )); then
    NEED_BUILD=1
    NEED_RECREATE=1
  elif ! container_exists "$SERVER_CONTAINER"; then
    NEED_BUILD=1
  fi

  start_stack
  ensure_running
  wait_for_health
  open_browser "$APP_URL"
  print_summary
}

main "$@"
