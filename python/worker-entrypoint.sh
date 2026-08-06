#!/usr/bin/env bash
set -euo pipefail

cd /app/python
export PYTHONPATH=/app/python
export PYTHONUNBUFFERED=1

echo "[hbs-worker] redis=${REDIS_URL:-redis://redis:6379/0}"
echo "[hbs-worker] storage=${STORAGE_ROOT:-/data/storage}"
echo "[hbs-worker] concurrency=${WORKER_CONCURRENCY:-3}"

# Wait for redis
for i in $(seq 1 60); do
  if python -c "import redis,os; r=redis.Redis.from_url(os.environ.get('REDIS_URL','redis://redis:6379/0')); r.ping()" 2>/dev/null; then
    echo "[hbs-worker] redis up"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "[hbs-worker] ERROR: redis not ready" >&2
    exit 1
  fi
  sleep 1
done

QUEUES="${CELERY_QUEUES:-default,scans,heavy,cron}"
exec celery -A worker.celery_app worker \
  --pool=prefork \
  --concurrency="${WORKER_CONCURRENCY:-3}" \
  --queues="${QUEUES}" \
  --max-tasks-per-child="${WORKER_MAX_TASKS_PER_CHILD:-25}" \
  --loglevel="${WORKER_LOGLEVEL:-INFO}" \
  --without-gossip --without-mingle --without-heartbeat
