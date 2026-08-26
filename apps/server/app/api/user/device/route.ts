import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const devices = await prisma.mobileDevice.findMany({
    where: { userId: session.user.id },
    orderBy: { lastSeenAt: "desc" },
  });
  return ok({
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      platform: d.platform,
      lastIp: d.lastIp,
      lastSeenAt: d.lastSeenAt.toISOString(),
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return badRequest("id required");
  await prisma.mobileDevice.deleteMany({ where: { id, userId: session.user.id } });
  return ok({ deleted: true });
}
