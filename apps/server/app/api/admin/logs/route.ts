import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export const GET = withApiLog(
  "GET /api/admin/logs",
  async (request: NextRequest) => {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
    const type = searchParams.get("type") || undefined;
    const level = searchParams.get("level") || undefined;
    const q = searchParams.get("q")?.trim();

    const where = {
      ...(type ? { type } : {}),
      ...(level ? { level } : {}),
      ...(q
        ? {
            OR: [
              { message: { contains: q, mode: "insensitive" as const } },
              { userEmail: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return ok({ logs, total, limit, offset });
  },
);

export const DELETE = withApiLog(
  "DELETE /api/admin/logs",
  async (request: NextRequest) => {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    if (all === "1") {
      const result = await prisma.systemLog.deleteMany({});
      return ok({ deleted: result.count });
    }

    if (!id) return badRequest("id or all=1 required");
    await prisma.systemLog.delete({ where: { id } });
    return ok({ deleted: 1, id });
  },
);
