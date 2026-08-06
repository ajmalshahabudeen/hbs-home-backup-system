"""Filesystem scan + consistency against backup_file table."""
from __future__ import annotations

import hashlib
import mimetypes
import os
import posixpath
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable

from worker.db import connect, new_id


def storage_root() -> Path:
    root = os.environ.get("STORAGE_ROOT") or os.environ.get("HOST_STORAGE_PATH") or "/data/storage"
    return Path(root)


def user_root(user_id: str) -> Path:
    p = storage_root() / "users" / user_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def to_rel(path: Path, root: Path) -> str:
    rel = path.relative_to(root).as_posix()
    return "" if rel == "." else rel


def parent_of(rel: str) -> str:
    if not rel or "/" not in rel:
        return ""
    return posixpath.dirname(rel)


def guess_mime(name: str) -> str | None:
    mt, _ = mimetypes.guess_type(name)
    return mt


def file_sha256(path: str, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def walk_user_files(user_id: str) -> list[dict[str, Any]]:
    root = user_root(user_id)
    entries: list[dict[str, Any]] = []
    if not root.exists():
        return entries
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        # skip hidden
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for d in dirnames:
            full = base / d
            rel = to_rel(full, root)
            entries.append(
                {
                    "path": rel,
                    "name": d,
                    "parentPath": parent_of(rel),
                    "isDir": True,
                    "size": 0,
                    "mimeType": None,
                }
            )
        for name in filenames:
            if name.startswith("."):
                continue
            full = base / name
            try:
                st = full.stat()
            except OSError:
                continue
            rel = to_rel(full, root)
            entries.append(
                {
                    "path": rel,
                    "name": name,
                    "parentPath": parent_of(rel),
                    "isDir": False,
                    "size": int(st.st_size),
                    "mimeType": guess_mime(name),
                    "abs": str(full),
                }
            )
    return entries


def upsert_entries(user_id: str, entries: list[dict[str, Any]]) -> int:
    if not entries:
        return 0
    n = 0
    with connect() as conn:
        with conn.cursor() as cur:
            for e in entries:
                cur.execute(
                    """
                    INSERT INTO backup_file
                      (id, "userId", path, name, "parentPath", "isDir", "mimeType", size, "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT ("userId", path) DO UPDATE SET
                      name = EXCLUDED.name,
                      "parentPath" = EXCLUDED."parentPath",
                      "isDir" = EXCLUDED."isDir",
                      "mimeType" = EXCLUDED."mimeType",
                      size = EXCLUDED.size,
                      "updatedAt" = NOW()
                    """,
                    (
                        new_id(),
                        user_id,
                        e["path"],
                        e["name"],
                        e["parentPath"],
                        e["isDir"],
                        e.get("mimeType"),
                        e.get("size", 0),
                    ),
                )
                n += 1
            conn.commit()
    return n


def db_paths(user_id: str) -> dict[str, dict[str, Any]]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, path, name, "isDir", size, checksum FROM backup_file WHERE "userId" = %s',
                (user_id,),
            )
            return {r["path"]: dict(r) for r in cur.fetchall()}


def delete_db_paths(user_id: str, paths: list[str]) -> int:
    if not paths:
        return 0
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM backup_file WHERE "userId" = %s AND path = ANY(%s)',
                (user_id, paths),
            )
            n = cur.rowcount
            conn.commit()
            return n


def set_checksums(user_id: str, pairs: list[tuple[str, str]]) -> int:
    if not pairs:
        return 0
    n = 0
    with connect() as conn:
        with conn.cursor() as cur:
            for path, checksum in pairs:
                cur.execute(
                    """
                    UPDATE backup_file
                    SET checksum = %s, "updatedAt" = NOW()
                    WHERE "userId" = %s AND path = %s
                    """,
                    (checksum, user_id, path),
                )
                n += cur.rowcount
            conn.commit()
    return n


def scan_user(
    user_id: str,
    progress_cb: Callable[[int, str, str], None] | None = None,
) -> dict[str, Any]:
    if progress_cb:
        progress_cb(5, "WALK", "Walking filesystem")
    entries = walk_user_files(user_id)
    if progress_cb:
        progress_cb(40, "UPSERT", f"Upserting {len(entries)} entries")
    count = upsert_entries(user_id, entries)
    if progress_cb:
        progress_cb(100, "DONE", "Scan complete")
    return {
        "userId": user_id,
        "entries": len(entries),
        "upserted": count,
        "files": sum(1 for e in entries if not e["isDir"]),
        "dirs": sum(1 for e in entries if e["isDir"]),
    }


def consistency_check(
    user_id: str,
    *,
    fix: bool = True,
    progress_cb: Callable[[int, str, str], None] | None = None,
) -> dict[str, Any]:
    if progress_cb:
        progress_cb(10, "DISK", "Reading disk")
    disk = {e["path"]: e for e in walk_user_files(user_id)}
    if progress_cb:
        progress_cb(40, "DB", "Reading database")
    db = db_paths(user_id)

    missing_on_disk = [p for p in db if p not in disk]
    missing_in_db = [p for p in disk if p not in db]

    fixed_deleted = 0
    fixed_added = 0
    if fix:
        if progress_cb:
            progress_cb(70, "FIX", "Applying fixes")
        if missing_on_disk:
            fixed_deleted = delete_db_paths(user_id, missing_on_disk)
        if missing_in_db:
            fixed_added = upsert_entries(user_id, [disk[p] for p in missing_in_db])

    if progress_cb:
        progress_cb(100, "DONE", "Consistency complete")

    return {
        "userId": user_id,
        "diskCount": len(disk),
        "dbCount": len(db),
        "missingOnDisk": missing_on_disk[:200],
        "missingInDb": missing_in_db[:200],
        "missingOnDiskCount": len(missing_on_disk),
        "missingInDbCount": len(missing_in_db),
        "fixedDeleted": fixed_deleted,
        "fixedAdded": fixed_added,
        "consistent": len(missing_on_disk) == 0 and len(missing_in_db) == 0,
    }


def _checksum_one(args: tuple[str, str]) -> tuple[str, str | None, str | None]:
    rel, abs_path = args
    try:
        return rel, file_sha256(abs_path), None
    except Exception as e:  # noqa: BLE001
        return rel, None, str(e)


def parallel_checksums(
    user_id: str,
    *,
    max_workers: int | None = None,
    limit: int = 500,
    progress_cb: Callable[[int, str, str], None] | None = None,
) -> dict[str, Any]:
    entries = [e for e in walk_user_files(user_id) if not e["isDir"]]
    entries = entries[:limit]
    work = [(e["path"], e["abs"]) for e in entries if e.get("abs")]
    workers = max_workers or min(4, max(1, (os.cpu_count() or 2)))
    if progress_cb:
        progress_cb(5, "HASH", f"Hashing {len(work)} files with {workers} workers")

    pairs: list[tuple[str, str]] = []
    errors: list[dict[str, str]] = []
    done = 0
    total = max(1, len(work))

    if not work:
        return {"userId": user_id, "hashed": 0, "errors": [], "workers": workers}

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(_checksum_one, item) for item in work]
        for fut in as_completed(futs):
            rel, digest, err = fut.result()
            done += 1
            if digest:
                pairs.append((rel, digest))
            if err:
                errors.append({"path": rel, "error": err})
            if progress_cb and done % 5 == 0:
                pct = 5 + int(90 * done / total)
                progress_cb(pct, "HASH", f"Hashed {done}/{total}")

    if progress_cb:
        progress_cb(95, "SAVE", "Saving checksums")
    saved = set_checksums(user_id, pairs)
    if progress_cb:
        progress_cb(100, "DONE", "Checksums complete")
    return {
        "userId": user_id,
        "hashed": len(pairs),
        "saved": saved,
        "errors": errors[:50],
        "workers": workers,
    }
