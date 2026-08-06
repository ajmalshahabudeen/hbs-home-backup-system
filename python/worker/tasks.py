from __future__ import annotations

import json
import traceback
from typing import Any

from celery.exceptions import SoftTimeLimitExceeded

from worker.cache import cache_set, ping as redis_ping
from worker.celery_app import app
from worker.db import (
    claim_job,
    get_job,
    list_user_ids,
    requeue_stale_running,
    update_job,
    write_system_log,
    connect,
)
from worker.scan import consistency_check, parallel_checksums, scan_user


def _progress(job_id: str):
    def cb(progress: int, stage: str, label: str) -> None:
        update_job(job_id, progress=progress, stage=stage, stage_label=label)

    return cb


def _run_guarded(job_id: str, fn) -> dict[str, Any]:
    row = claim_job(job_id)
    if not row:
        existing = get_job(job_id)
        return {"ok": False, "reason": "not_claimable", "status": (existing or {}).get("status")}
    try:
        update_job(job_id, celery_task_id=app.current_task.request.id if app.current_task else None)
        result = fn(row, _progress(job_id))
        update_job(
            job_id,
            status="COMPLETED",
            progress=100,
            stage="DONE",
            stage_label="Completed",
            result=result,
        )
        write_system_log(
            f"Job {row.get('type')} completed",
            type_="JOB",
            user_id=row.get("userId"),
            metadata={"jobId": job_id, "result": result},
        )
        return {"ok": True, "result": result}
    except SoftTimeLimitExceeded:
        update_job(
            job_id,
            status="FAILED",
            stage="TIMEOUT",
            stage_label="Timed out",
            error="soft time limit exceeded",
        )
        write_system_log(
            f"Job {job_id} timed out",
            level="ERROR",
            type_="JOB",
            status="FAILURE",
        )
        raise
    except Exception as e:  # noqa: BLE001
        update_job(
            job_id,
            status="FAILED",
            stage="ERROR",
            stage_label="Failed",
            error=f"{e}\n{traceback.format_exc()[-1500:]}",
        )
        write_system_log(
            f"Job {job_id} failed: {e}",
            level="ERROR",
            type_="JOB",
            status="FAILURE",
            metadata={"jobId": job_id},
        )
        raise


@app.task(name="worker.tasks.run_scan", bind=True)
def run_scan(self, job_id: str) -> dict[str, Any]:
    def body(row, progress_cb):
        payload = json.loads(row.get("payload") or "{}")
        user_id = row.get("userId") or payload.get("userId")
        if not user_id:
            raise ValueError("userId required")
        return scan_user(user_id, progress_cb=progress_cb)

    return _run_guarded(job_id, body)


@app.task(name="worker.tasks.run_consistency", bind=True)
def run_consistency(self, job_id: str) -> dict[str, Any]:
    def body(row, progress_cb):
        payload = json.loads(row.get("payload") or "{}")
        user_id = row.get("userId") or payload.get("userId")
        if not user_id:
            raise ValueError("userId required")
        fix = payload.get("fix", True)
        return consistency_check(user_id, fix=bool(fix), progress_cb=progress_cb)

    return _run_guarded(job_id, body)


@app.task(name="worker.tasks.run_checksums", bind=True)
def run_checksums(self, job_id: str) -> dict[str, Any]:
    def body(row, progress_cb):
        payload = json.loads(row.get("payload") or "{}")
        user_id = row.get("userId") or payload.get("userId")
        if not user_id:
            raise ValueError("userId required")
        workers = int(payload.get("workers") or 0) or None
        limit = int(payload.get("limit") or 500)
        return parallel_checksums(
            user_id,
            max_workers=workers,
            limit=limit,
            progress_cb=progress_cb,
        )

    return _run_guarded(job_id, body)


@app.task(name="worker.tasks.run_cron_consistency_all")
def run_cron_consistency_all() -> dict[str, Any]:
    from worker.db import create_job

    users = list_user_ids()
    job_ids = []
    for uid in users:
        jid = create_job("CONSISTENCY", {"userId": uid, "fix": True, "source": "cron"}, user_id=uid)
        run_consistency.delay(jid)
        job_ids.append(jid)
    write_system_log(
        f"Cron enqueued consistency for {len(users)} users",
        type_="CRON",
        metadata={"jobIds": job_ids},
    )
    cache_set("hbs:last_cron_consistency", {"users": len(users), "jobIds": job_ids}, ttl_seconds=86400)
    return {"ok": True, "users": len(users), "jobIds": job_ids}


@app.task(name="worker.tasks.run_requeue_stale")
def run_requeue_stale() -> dict[str, Any]:
    n = requeue_stale_running(minutes=int(__import__("os").environ.get("STALE_JOB_MINUTES", "60")))
    if n:
        write_system_log(f"Requeued {n} stale RUNNING jobs", type_="CRON", level="WARN")
    return {"ok": True, "requeued": n}


@app.task(name="worker.tasks.warm_stats_cache")
def warm_stats_cache() -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*)::int AS c FROM "user"')
            users = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*)::int AS c FROM backup_file WHERE \"isDir\" = false")
            files = cur.fetchone()["c"]
            cur.execute("SELECT COALESCE(SUM(size),0)::bigint AS s FROM backup_file WHERE \"isDir\" = false")
            total_bytes = int(cur.fetchone()["s"] or 0)
            cur.execute("SELECT COUNT(*)::int AS c FROM background_job WHERE status = 'PENDING'")
            pending = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*)::int AS c FROM background_job WHERE status = 'RUNNING'")
            running = cur.fetchone()["c"]
    stats = {
        "users": users,
        "files": files,
        "totalBytes": total_bytes,
        "jobsPending": pending,
        "jobsRunning": running,
        "redis": redis_ping(),
    }
    cache_set("hbs:stats", stats, ttl_seconds=120)
    return {"ok": True, "stats": stats}
