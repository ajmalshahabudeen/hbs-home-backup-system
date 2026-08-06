# HBS Home Backup System

Home backup server (Google Drive + Photos style) with:

- **Admin console** (`apps/server`) — Better Auth, users / files / logs / jobs CRUD
- **Postgres** (persistent Docker volume)
- **Redis** — Celery broker + result backend + stats cache
- **Python workers** — background scan, consistency, parallel checksums, cron (Celery beat)
- **Hard-drive storage** bind-mounted into server + workers
- Shared packages: `@workspace/auth`, `@workspace/db`, `@workspace/ui`
- Future: Expo mobile + desktop clients login as regular users

## Quick start (Docker)

1. Copy env and set your drive path:

```bash
cp .env.example .env
# Windows: HOST_STORAGE_PATH=F:/HBS-Backups
# Linux:   HOST_STORAGE_PATH=/mnt/data/hbs
```

2. Start everything:

```bash
# Windows
run.bat

# Linux / macOS / Git Bash
chmod +x run.sh
./run.sh
```

3. Open **http://127.0.0.1:38480** → **Register** (first user becomes **admin**).

## Services

| Service   | Container     | Port  | Notes                                      |
|-----------|---------------|-------|--------------------------------------------|
| Postgres  | `hbs-postgres`| 5432  | Volume `hbs_postgres_data` (persistent)    |
| Redis     | `hbs-redis`   | 6380→6379 | AOF volume `hbs_redis_data`            |
| Server    | `hbs-server`  | 38480 | Admin UI + Better Auth + admin APIs        |
| Worker    | `hbs-worker`  | —     | Celery prefork (scans/heavy/cron queues)   |
| Beat      | `hbs-beat`    | —     | Celery beat (nightly consistency, cache)   |

Storage mount: `HOST_STORAGE_PATH` → `/data/storage` inside server/worker/beat.

## Background jobs (Python + Redis)

Scripts live in `python/`:

| Job type | Purpose |
|----------|---------|
| `SCAN` | Walk user disk tree → upsert `backup_file` rows |
| `CONSISTENCY` | Heal DB vs disk drift (orphans / missing rows) |
| `CHECKSUM` | Parallel SHA-256 hashing (process pool) |
| `WARM_STATS` | Cache dashboard stats in Redis |
| `REQUEUE_STALE` | Reset stuck `RUNNING` jobs |
| `CRON_CONSISTENCY_ALL` | Enqueue consistency for every user |

Enqueue from admin UI (**Dashboard → Jobs**) or CLI:

```bash
docker exec hbs-worker python /app/python/enqueue_job.py --type SCAN --user-id <id>
docker exec hbs-worker python /app/python/enqueue_job.py --type CONSISTENCY --user-id <id>
docker exec hbs-worker python /app/python/enqueue_job.py --type CHECKSUM --user-id <id> --workers 4
```

Cron (Celery beat):

- Nightly full consistency @ 03:15 UTC  
- Requeue stale RUNNING every 15m  
- Warm stats cache every 2m  

## Local dev (without full Docker app)

```bash
# Postgres + Redis
bun run db:up
docker compose up -d redis

cp packages/db/.env.example packages/db/.env
cp apps/server/.env.example apps/server/.env

bun install
bun run db:generate
bun run db:push

# optional local python worker
pip install -r python/requirements.txt
export DATABASE_URL=postgresql://hbs:hbs_secret_change_me@localhost:5432/hbs_backup
export REDIS_URL=redis://localhost:6380/0
export STORAGE_ROOT=./data/storage
export PYTHONPATH=./python
celery -A worker.celery_app worker -Q default,scans,heavy,cron -c 2

bun run server:dev
```

## Auth (Better Auth)

- Shared config: `packages/auth`
- Mounted at `apps/server/app/api/auth/[...all]`
- Plugins: admin, organization, passkey
- Trusted origins include localhost + LAN + Expo schemes for future clients
- **Dashboard is admin-only**

## Admin API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Public health (db + redis + storage + jobs) |
| GET/POST/PATCH/DELETE | `/api/admin/users` | User CRUD |
| GET/POST/PATCH/DELETE | `/api/admin/files` | Per-user file browser CRUD |
| GET/POST | `/api/admin/jobs` | List / enqueue background jobs |
| GET/DELETE | `/api/admin/logs` | System audit logs |
| GET | `/api/admin/stats` | Dashboard stats |

## Force rebuild

```bash
FORCE_BUILD=1 ./run.sh
# Windows
set FORCE_BUILD=1 && run.bat
```
