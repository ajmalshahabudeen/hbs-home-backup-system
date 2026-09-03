import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireAdmin } from "@/lib/auth-guard";
import {
  callLanDeviceWakeup,
  scanAndWakeupDevices,
  sendDeviceWakeupPush,
} from "@/lib/device-presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/admin/devices/scan",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    try {
      const devices = await prisma.mobileDevice.findMany({
        orderBy: { lastSeenAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return ok({
        devices: devices.map((d) => ({
          id: d.id,
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          platform: d.platform,
          hasPushToken: !!d.pushToken,
          lastIp: d.lastIp,
          lastSeenAt: d.lastSeenAt.toISOString(),
          user: d.user,
        })),
      });
    } catch (e) {
      return badRequest(
        e instanceof Error ? e.message : "Failed to list devices",
      );
    }
  },
);

export const POST = withApiLog(
  "POST /api/admin/devices/scan",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    try {
      const body = await request.json().catch(() => ({}));
      const { deviceId, pushToken, serverUrl } = body || {};

      if (deviceId) {
        const device = await prisma.mobileDevice.findFirst({
          where: { deviceId: String(deviceId) },
        });

        if (!device) {
          return badRequest("Device not found");
        }

        let lanSuccess = false;
        if (device.lastIp && device.lastIp !== "127.0.0.1") {
          const lanRes = await callLanDeviceWakeup(device.lastIp, { serverUrl });
          if (lanRes.success) {
            lanSuccess = true;
          }
        }

        let pushRes;
        if (!lanSuccess && device.pushToken) {
          pushRes = await sendDeviceWakeupPush(device.pushToken, {
            title: "HBS Sync Trigger",
            body: "Admin triggered autonomous background backup.",
            serverUrl,
          });
        }

        if (lanSuccess || pushRes?.success) {
          await prisma.mobileDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() },
          });
          return ok({
            success: true,
            lanDelivered: lanSuccess,
            pushDelivered: !!pushRes?.success,
          });
        }

        return ok({
          success: false,
          error: "Device unreachable on LAN and no valid push token delivered",
        });
      }

      // Otherwise scan and wake up all registered devices
      const result = await scanAndWakeupDevices(serverUrl);
      return ok(result);
    } catch (e) {
      return badRequest(
        e instanceof Error ? e.message : "Device presence sweep failed",
      );
    }
  },
);
