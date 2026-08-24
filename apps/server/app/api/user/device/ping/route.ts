import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest, clientMeta } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const meta = clientMeta(request);

  try {
    const body = await request.json().catch(() => ({}));
    const { deviceId, localIp } = body || {};

    const ip = localIp ? String(localIp).trim() : meta.ipAddress;

    if (deviceId) {
      await prisma.mobileDevice.updateMany({
        where: {
          userId,
          deviceId: String(deviceId),
        },
        data: {
          lastSeenAt: new Date(),
          ...(ip ? { lastIp: ip } : {}),
        },
      });
    }

    return ok({
      success: true,
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      clientIp: ip,
    });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Heartbeat ping failed");
  }
}
