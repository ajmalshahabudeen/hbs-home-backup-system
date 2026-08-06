#!/usr/bin/env python3
"""Enqueue a background job into Postgres + Celery.

Usage:
  python enqueue_job.py --type SCAN --user-id <id>
  python enqueue_job.py --type CONSISTENCY --user-id <id> --fix true
  python enqueue_job.py --type CHECKSUM --user-id <id> --workers 4 --limit 200
  python enqueue_job.py --type CRON_CONSISTENCY_ALL
  python enqueue_job.py --type REQUEUE_STALE
  python enqueue_job.py --type WARM_STATS

Prints JSON on stdout.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Ensure /app/python is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from worker.db import create_job  # noqa: E402
from worker.celery_app import app  # noqa: E402
from worker import tasks as task_mod  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--type", required=True)
    p.add_argument("--user-id", default=None)
    p.add_argument("--fix", default="true")
    p.add_argument("--workers", type=int, default=0)
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--payload", default=None, help="Extra JSON payload")
    args = p.parse_args()

    extra = json.loads(args.payload) if args.payload else {}
    t = args.type.upper()

    # Fire-and-forget tasks without a job row
    if t in ("CRON_CONSISTENCY_ALL", "REQUEUE_STALE", "WARM_STATS"):
        mapping = {
            "CRON_CONSISTENCY_ALL": task_mod.run_cron_consistency_all,
            "REQUEUE_STALE": task_mod.run_requeue_stale,
            "WARM_STATS": task_mod.warm_stats_cache,
        }
        async_result = mapping[t].delay()
        print(json.dumps({"ok": True, "type": t, "taskId": async_result.id}))
        return 0

    if t not in ("SCAN", "CONSISTENCY", "CHECKSUM"):
        print(json.dumps({"ok": False, "error": f"unknown type {t}"}))
        return 2

    if not args.user_id:
        print(json.dumps({"ok": False, "error": "user-id required"}))
        return 2

    payload = {
        "userId": args.user_id,
        "fix": str(args.fix).lower() in ("1", "true", "yes"),
        "workers": args.workers or None,
        "limit": args.limit,
        **extra,
    }
    job_id = create_job(t, payload, user_id=args.user_id)

    if t == "SCAN":
        async_result = task_mod.run_scan.delay(job_id)
    elif t == "CONSISTENCY":
        async_result = task_mod.run_consistency.delay(job_id)
    else:
        async_result = task_mod.run_checksums.delay(job_id)

    # store celery id
    from worker.db import update_job

    update_job(job_id, celery_task_id=async_result.id)

    print(
        json.dumps(
            {
                "ok": True,
                "jobId": job_id,
                "taskId": async_result.id,
                "type": t,
                "queueBackend": "celery",
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
