import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import {
  badRequest,
  clientMeta,
  ok,
  requireSession,
  writeLog,
} from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiLog(
  "POST /api/user/device/register",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    const meta = clientMeta(request);

    try {
      const body = await request.json();
      const { deviceId, deviceName, platform, pushToken, localIp } = body || {};

      if (!deviceId) {
        return badRequest("deviceId is required for registration");
      }

      const ip = localIp ? String(localIp).trim() : meta.ipAddress;

      const device = await prisma.mobileDevice.upsert({
        where: {
          userId_deviceId: {
            userId,
            deviceId: String(deviceId),
          },
        },
        create: {
          userId,
          deviceId: String(deviceId),
          deviceName: deviceName ? String(deviceName).trim() : undefined,
          platform: platform
            ? String(platform).toLowerCase().trim()
            : "android",
          pushToken: pushToken ? String(pushToken).trim() : undefined,
          lastIp: ip,
          lastSeenAt: new Date(),
        },
        update: {
          deviceName: deviceName ? String(deviceName).trim() : undefined,
          platform: platform
            ? String(platform).toLowerCase().trim()
            : undefined,
          pushToken: pushToken ? String(pushToken).trim() : undefined,
          lastIp: ip,
          lastSeenAt: new Date(),
        },
      });

      await writeLog({
        type: "DEVICE_REGISTER",
        message: `Device registered: ${device.deviceName || device.deviceId} (${device.platform}) at ${ip || "unknown IP"}`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          hasPushToken: !!device.pushToken,
          lastIp: device.lastIp,
        },
      });

      return ok({
        success: true,
        device: {
          id: device.id,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          pushToken: device.pushToken,
          lastIp: device.lastIp,
          lastSeenAt: device.lastSeenAt.toISOString(),
        },
      });
    } catch (e) {
      return badRequest(
        e instanceof Error ? e.message : "Failed to register device",
      );
    }
  },
);
