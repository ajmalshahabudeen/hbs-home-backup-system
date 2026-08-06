import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireAdmin, ok } from "@/lib/auth-guard";
import { ensureStorageReady, getStorageRoot } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  const storage = ensureStorageReady();

  const [userCount, adminCount, fileCount, logCount, recentLogs, recentUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.backupFile.count({ where: { isDir: false } }),
      prisma.systemLog.count(),
      prisma.systemLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

  const sizeAgg = await prisma.backupFile.aggregate({
    _sum: { size: true },
    where: { isDir: false },
  });

  return ok({
    admin: {
      id: session!.user.id,
      name: session!.user.name,
      email: session!.user.email,
    },
    stats: {
      users: userCount,
      admins: adminCount,
      files: fileCount,
      logs: logCount,
      totalBytes: Number(sizeAgg._sum.size || 0),
    },
    storage,
    storageRoot: getStorageRoot(),
    recentLogs,
    recentUsers,
  });
}
