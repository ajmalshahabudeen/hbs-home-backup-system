import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireAdmin, ok, badRequest } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
}

export async function DELETE(request: NextRequest) {
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
}
