import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import {
  badRequest,
  clientMeta,
  ok,
  requireAdmin,
  writeLog,
} from "@/lib/auth-guard";
import { parseUserAgent } from "@/lib/user-agent";

export const dynamic = "force-dynamic";

export const GET = withApiLog(
  "GET /api/admin/sessions",
  async (request: NextRequest) => {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const activeOnly = url.searchParams.get("active") !== "0";
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);

    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        ...(activeOnly ? { expiresAt: { gt: now } } : {}),
        ...(q
          ? {
              OR: [
                { ipAddress: { contains: q, mode: "insensitive" } },
                { userAgent: { contains: q, mode: "insensitive" } },
                { user: { email: { contains: q, mode: "insensitive" } } },
                { user: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
          },
        },
      },
    });

    const items = sessions.map((s) => {
      const device = parseUserAgent(s.userAgent);
      return {
        id: s.id,
        userId: s.userId,
        user: s.user,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceName: device.deviceName,
        browser: device.browser,
        os: device.os,
        deviceType: device.deviceType,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        expiresAt: s.expiresAt,
        active: s.expiresAt > now,
        impersonatedBy: s.impersonatedBy,
      };
    });

    const totalActive = await prisma.session.count({
      where: { expiresAt: { gt: now } },
    });

    return ok({
      sessions: items,
      total: items.length,
      totalActive,
    });
  },
);

export const DELETE = withApiLog(
  "DELETE /api/admin/sessions",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const all = url.searchParams.get("all") === "1";
    const meta = clientMeta(request);

    if (all) {
      // Revoke everyone else's sessions (keep current admin session)
      const currentToken = session!.session.token;
      const result = await prisma.session.deleteMany({
        where: { token: { not: currentToken } },
      });
      await writeLog({
        type: "SESSION",
        message: `Revoked ${result.count} session(s) (kept current)`,
        userId: session!.user.id,
        userEmail: session!.user.email,
        ...meta,
      });
      return ok({ deleted: result.count });
    }

    if (!id) return badRequest("id required (or all=1)");

    const target = await prisma.session.findUnique({ where: { id } });
    if (!target) return badRequest("Session not found");

    // Don't allow deleting own session via this path accidentally without intent —
    // still allow it if admin wants to force re-login
    await prisma.session.delete({ where: { id } });
    await writeLog({
      type: "SESSION",
      message: `Revoked session ${id} for user ${target.userId}`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
      metadata: { targetUserId: target.userId, targetIp: target.ipAddress },
    });

    return ok({ deleted: 1 });
  },
);
