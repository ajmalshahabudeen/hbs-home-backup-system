#!/usr/bin/env python3
"""
HBS Home Backup System — LAN Device Presence Scanner
Scans the local area network (LAN) for registered mobile devices on a regular interval (10s - 60s).
When a registered device is detected active on Wi-Fi, it sends a wake-up push notification via Expo Push API
or triggers the HBS server wake-up endpoint so the phone begins autonomous background photo/video backup.
"""

import os
import sys
import time
import socket
import json
import urllib.request
import urllib.error

SERVER_URL = os.environ.get("HBS_SERVER_URL", "http://127.0.0.1:38480")
SCAN_INTERVAL_SECONDS = int(os.environ.get("HBS_SCAN_INTERVAL", "30"))
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def check_port(ip: str, port: int = 8081, timeout: float = 0.5) -> bool:
    """Fast socket connect to check if device IP is active on LAN."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        # 0 = Connected, 10061/111 = Connection Refused (host is still active and replying with RST)
        return result in (0, 111, 10061)
    except Exception:
        return False


def ping_host(ip: str) -> bool:
    """Checks common mobile development / web ports to verify if host is online."""
    for port in [8081, 19000, 80, 443, 5555]:
        if check_port(ip, port, timeout=0.3):
            return True
    return False


def send_expo_wakeup_push(push_token: str, server_url: str) -> bool:
    """Dispatches a silent/high-priority Expo Push Notification to wake up the mobile app."""
    if not push_token or not push_token.startswith("ExponentPushToken"):
        return False

    payload = {
        "to": push_token,
        "title": "HBS Home Cloud",
        "body": "LAN connection active. Checking for new media to back up...",
        "sound": "default",
        "priority": "high",
        "channelId": "hbs-sync-progress",
        "_displayInForeground": True,
        "_contentAvailable": True,
        "data": {
            "action": "autonomous_sync",
            "serverUrl": server_url,
            "timestamp": int(time.time() * 1000),
            "reason": "python_lan_scanner",
        },
    }

    try:
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "HBS-Device-Scanner/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            status = res_data.get("data", {}).get("status")
            return status != "error"
    except Exception as e:
        print(f"[HBS Scanner] Push error: {e}", file=sys.stderr)
        return False


def run_scanner_loop():
    print(f"[HBS Scanner] Starting LAN Presence Scanner for server {SERVER_URL}")
    print(f"[HBS Scanner] Scan interval: {SCAN_INTERVAL_SECONDS}s")

    last_wake_times = {}

    while True:
        try:
            # Query server for registered devices list
            req = urllib.request.Request(f"{SERVER_URL}/api/health")
            server_online = False
            try:
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if resp.status == 200:
                        server_online = True
            except Exception:
                pass

            if not server_online:
                print(f"[HBS Scanner] Server {SERVER_URL} is offline. Retrying in {SCAN_INTERVAL_SECONDS}s...")
                time.sleep(SCAN_INTERVAL_SECONDS)
                continue

            print(f"[HBS Scanner] Server online. Checking registered devices...")
            # We can trigger server sweep endpoint or send pushes directly
            try:
                sweep_req = urllib.request.Request(
                    f"{SERVER_URL}/api/admin/devices/scan",
                    data=json.dumps({"serverUrl": SERVER_URL}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(sweep_req, timeout=10) as sweep_resp:
                    res = json.loads(sweep_resp.read().decode("utf-8"))
                    print(f"[HBS Scanner] Presence sweep complete: {res.get('scannedCount', 0)} devices scanned.")
            except Exception as e:
                # If admin endpoint requires session, log and wait
                pass

        except KeyboardInterrupt:
            print("[HBS Scanner] Stopped.")
            break
        except Exception as e:
            print(f"[HBS Scanner] Loop error: {e}", file=sys.stderr)

        time.sleep(SCAN_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_scanner_loop()
