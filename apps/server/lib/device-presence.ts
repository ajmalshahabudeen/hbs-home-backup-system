import net from "node:net";
import { prisma } from "@workspace/db";
import { term } from "./term-log";

export interface PushResult {
  success: boolean;
  ticketId?: string;
  error?: string;
}

/**
 * Dispatches an Expo Push Notification to a registered mobile device.
 * Sends high-priority data payload with action: 'autonomous_sync' to trigger background sync.
 */
export async function sendDeviceWakeupPush(
  pushToken: string,
  options?: {
    title?: string;
    body?: string;
    serverUrl?: string;
    forceNotification?: boolean;
  },
): Promise<PushResult> {
  if (!pushToken || !pushToken.trim()) {
    term("PUSH", "wakeup skipped — empty token");
    return { success: false, error: "Empty push token" };
  }

  const title = options?.title || "HBS Cloud Backup";
  const body = options?.body || "Syncing camera roll in background...";
  const serverUrl = options?.serverUrl || "";
  term("PUSH", "→ Expo wakeup", { title, serverUrl: serverUrl || "(none)" });

  try {
    const payload = {
      to: pushToken.trim(),
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "hbs-sync-progress",
      _displayInForeground: true,
      _contentAvailable: true, // Wake up iOS / Android background handler
      data: {
        action: "autonomous_sync",
        serverUrl,
        timestamp: Date.now(),
        reason: "server_presence_trigger",
      },
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      term("WARN", "Expo push HTTP error", {
        status: res.status,
        errText: errText.slice(0, 200),
      });
      return {
        success: false,
        error: `Expo Push API HTTP ${res.status}: ${errText}`,
      };
    }

    const data: any = await res.json();
    const ticket = data?.data;

    if (ticket?.status === "error") {
      return {
        success: false,
        error: ticket.message || ticket.details?.error || "Push delivery error",
      };
    }

    return {
      success: true,
      ticketId: ticket?.id,
    };
  } catch (err) {
    term("ERROR", "Expo wakeup failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to dispatch push notification",
    };
  }
}

/**
 * Probes a local IP address on common ports (8081 Metro, 80 HTTP, 443 HTTPS, 5555 ADB)
 * with a fast 400ms timeout to detect if a phone is awake on the LAN.
 */
export async function probeLanHost(
  ip: string,
  timeoutMs: number = 400,
): Promise<boolean> {
  if (!ip || ip === "127.0.0.1" || ip === "localhost") return false;
  term("SCAN", "→ probeLanHost", { ip, timeoutMs });

  const candidatePorts = [8081, 19000, 80, 443, 5555];

  for (const port of candidatePorts) {
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.on("connect", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(true);
        }
      });

      socket.on("timeout", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.on("error", (err: any) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          // ECONNREFUSED still means the IP host is online and replying with RST!
          if (err.code === "ECONNREFUSED") {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      });

      try {
        socket.connect(port, ip);
      } catch {
        resolve(false);
      }
    });

    if (reachable) {
      term("SCAN", "← probeLanHost online", { ip, port });
      return true;
    }
  }

  term("SCAN", "← probeLanHost offline", { ip });
  return false;
}

/**
 * Scans all registered mobile devices, tests their last known LAN IP,
 * and sends wake-up push signals to prompt background auto-sync.
 */
export async function scanAndWakeupDevices(serverUrl?: string) {
  term("SCAN", "→ scanAndWakeupDevices", { serverUrl: serverUrl || "(none)" });
  try {
    const devices = await prisma.mobileDevice.findMany({
      where: {
        pushToken: { not: null },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    const results: Array<{
      deviceId: string;
      deviceName: string | null;
      userEmail: string;
      ip: string | null;
      isOnlineOnLan: boolean;
      pushSent: boolean;
      pushResult?: PushResult;
    }> = [];

    for (const device of devices) {
      const ip = device.lastIp;
      let isOnline = false;

      if (ip && ip !== "127.0.0.1") {
        isOnline = await probeLanHost(ip, 500);
      }

      let pushRes: PushResult | undefined;

      if (device.pushToken) {
        pushRes = await sendDeviceWakeupPush(device.pushToken, {
          title: "HBS Home Cloud",
          body: "LAN connection active. Checking for new photos to back up...",
          serverUrl,
        });

        if (pushRes.success) {
          await prisma.mobileDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() },
          });
        }
      }

      results.push({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        userEmail: device.user.email,
        ip,
        isOnlineOnLan: isOnline,
        pushSent: !!pushRes?.success,
        pushResult: pushRes,
      });
    }

    term("SCAN", "← scanAndWakeupDevices", {
      scanned: devices.length,
      online: results.filter((r) => r.isOnlineOnLan).length,
      pushed: results.filter((r) => r.pushSent).length,
    });
    return {
      success: true,
      scannedCount: devices.length,
      devices: results,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    term("ERROR", "scanAndWakeupDevices failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "Scan and wakeup failed",
    };
  }
}
