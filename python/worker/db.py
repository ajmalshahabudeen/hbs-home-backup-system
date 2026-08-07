"""Shared DB helpers (Postgres) for Celery workers — mirrors Prisma tables."""
from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    # Prisma uses ?schema=public — psycopg rejects unknown query params
    if "?" in url:
        base, qs = url.split("?", 1)
        parts = [
            p
            for p in qs.split("&")
            if p and not p.lower().startswith("schema=")
        ]
        url = base + (("?" + "&".join(parts)) if parts else "")
    return url


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    with psycopg.connect(database_url(), row_factory=dict_row) as conn:
        yield conn


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


def claim_job(job_id: str) -> dict[str, Any] | None:
    """Atomically claim PENDING → RUNNING."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE background_job
                SET status = 'RUNNING',
                    stage = 'STARTING',
                    "stageLabel" = 'Starting',
                    progress = 1,
                    "startedAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE id = %s AND status = 'PENDING'
                RETURNING *
                """,
                (job_id,),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    stage_label: str | None = None,
    progress: int | None = None,
    result: Any = None,
    error: str | None = None,
    celery_task_id: str | None = None,
) -> None:
    fields: list[str] = ['"updatedAt" = NOW()']
    values: list[Any] = []
    if status is not None:
        fields.append("status = %s")
        values.append(status)
        if status in ("COMPLETED", "FAILED", "CANCELLED"):
            fields.append('"finishedAt" = NOW()')
    if stage is not None:
        fields.append("stage = %s")
        values.append(stage)
    if stage_label is not None:
        fields.append('"stageLabel" = %s')
        values.append(stage_label)
    if progress is not None:
        fields.append("progress = %s")
        values.append(max(0, min(100, int(progress))))
    if result is not None:
        fields.append("result = %s")
        values.append(json.dumps(result) if not isinstance(result, str) else result)
    if error is not None:
        fields.append("error = %s")
        values.append(error)
    if celery_task_id is not None:
        fields.append('"celeryTaskId" = %s')
        values.append(celery_task_id)
    values.append(job_id)
    sql = f"UPDATE background_job SET {', '.join(fields)} WHERE id = %s"
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)
            conn.commit()


def get_job(job_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM background_job WHERE id = %s", (job_id,))
            row = cur.fetchone()
            return dict(row) if row else None


def create_job(
    job_type: str,
    payload: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> str:
    jid = new_id()
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO background_job
                  (id, type, status, progress, payload, "userId", "createdAt", "updatedAt")
                VALUES (%s, %s, 'PENDING', 0, %s, %s, NOW(), NOW())
                """,
                (
                    jid,
                    job_type,
                    json.dumps(payload or {}),
                    user_id,
                ),
            )
            conn.commit()
    return jid


def list_user_ids() -> list[str]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM "user"')
            return [r["id"] for r in cur.fetchall()]


def write_system_log(
    message: str,
    *,
    level: str = "INFO",
    type_: str = "SYSTEM",
    status: str = "SUCCESS",
    user_id: str | None = None,
    metadata: Any = None,
) -> None:
    line = f"[HBS][{level}][{type_}] {message}"
    if level == "ERROR":
        print(line, flush=True)
    elif level == "WARN":
        print(line, flush=True)
    else:
        print(line, flush=True)
    if metadata is not None:
        try:
            print(f"[HBS][META] {json.dumps(metadata, default=str)[:500]}", flush=True)
        except Exception:
            pass
    try:
        with connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO system_log
                      (id, timestamp, level, type, message, status, "userId", metadata, "createdAt")
                    VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, NOW())
                    """
                    ,
                    (
                        new_id(),
                        level,
                        type_,
                        message,
                        status,
                        user_id,
                        json.dumps(metadata) if metadata is not None else None,
                    ),
                )
                conn.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[HBS][ERROR][LOG] failed to persist system log: {e}", flush=True)


def requeue_stale_running(minutes: int = 60) -> int:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE background_job
                SET status = 'PENDING',
                    stage = 'REQUEUED',
                    "stageLabel" = 'Requeued after stale RUNNING',
                    progress = 0,
                    "updatedAt" = NOW(),
                    "startedAt" = NULL
                WHERE status = 'RUNNING'
                  AND "updatedAt" < NOW() - (%s || ' minutes')::interval
                """,
                (str(minutes),),
            )
            n = cur.rowcount
            conn.commit()
            return n
