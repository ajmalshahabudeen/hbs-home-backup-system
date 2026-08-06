from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = Celery("hbs_worker", broker=REDIS_URL, backend=REDIS_URL)

app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=int(os.environ.get("WORKER_MAX_TASKS_PER_CHILD", "25")),
    task_soft_time_limit=int(os.environ.get("TASK_SOFT_TIME_LIMIT", "1800")),
    task_time_limit=int(os.environ.get("TASK_TIME_LIMIT", "1900")),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    task_default_queue="default",
    task_routes={
        "worker.tasks.run_scan": {"queue": "scans"},
        "worker.tasks.run_consistency": {"queue": "scans"},
        "worker.tasks.run_checksums": {"queue": "heavy"},
        "worker.tasks.run_cron_consistency_all": {"queue": "cron"},
        "worker.tasks.run_requeue_stale": {"queue": "cron"},
        "worker.tasks.warm_stats_cache": {"queue": "cron"},
    },
    beat_schedule={
        # Nightly full consistency for all users (03:15 UTC)
        "nightly-consistency": {
            "task": "worker.tasks.run_cron_consistency_all",
            "schedule": crontab(minute=15, hour=3),
        },
        # Requeue stuck RUNNING jobs every 15 minutes
        "requeue-stale": {
            "task": "worker.tasks.run_requeue_stale",
            "schedule": crontab(minute="*/15"),
        },
        # Warm dashboard stats cache every 2 minutes
        "warm-stats": {
            "task": "worker.tasks.warm_stats_cache",
            "schedule": crontab(minute="*/2"),
        },
    },
)

# Import tasks so worker registers them
app.autodiscover_tasks(["worker"], force=True)
import worker.tasks  # noqa: E402,F401
