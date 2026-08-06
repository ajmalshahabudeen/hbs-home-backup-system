"""Redis cache helpers."""
from __future__ import annotations

import json
import os
from typing import Any

import redis

_client: redis.Redis | None = None


def redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(redis_url(), decode_responses=True)
    return _client


def cache_get(key: str) -> Any | None:
    raw = get_redis().get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    get_redis().setex(key, ttl_seconds, json.dumps(value, default=str))


def cache_delete_prefix(prefix: str) -> int:
    r = get_redis()
    n = 0
    for key in r.scan_iter(match=f"{prefix}*"):
        r.delete(key)
        n += 1
    return n


def ping() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False
