#!/usr/bin/env bash
set -euo pipefail

cd /app/python
export PYTHONPATH=/app/python
export PYTHONUNBUFFERED=1

echo "[hbs-beat] starting celery beat"

for i in $(seq 1 60); do
  if python -c "import redis,os; r=redis.Redis.from_url(os.environ.get('REDIS_URL','redis://redis:6379/0')); r.ping()" 2>/dev/null; then
    break
  fi
  sleep 1
done

exec celery -A worker.celery_app beat --loglevel="${WORKER_LOGLEVEL:-INFO}"
