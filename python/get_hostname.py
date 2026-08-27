#!/usr/bin/env python3
"""Print this PC's LAN hostname as JSON (no network calls).

Used by run.sh so Docker gets HBS_HOSTNAME=zoro.local instead of the
container name. Stdout is a single JSON object.
"""
from __future__ import annotations

import json
import os
import socket
import sys


def normalize(raw: str) -> str:
    h = (raw or "").strip().lower()
    h = h.replace("http://", "").replace("https://", "")
    h = h.split("/")[0]
    h = h.split(":")[0]
    h = h.rstrip(".")
    if not h:
        return ""
    parts = h.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        return ""
    if "." in h:
        return h
    return f"{h}.local"


def main() -> int:
    env = os.environ.get("HBS_HOSTNAME") or os.environ.get("HBS_PUBLIC_HOST") or ""
    host = socket.gethostname()
    mdns = normalize(env) or normalize(host)
    print(json.dumps({"hostname": host, "mdns": mdns}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
