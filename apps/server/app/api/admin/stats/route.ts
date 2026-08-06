import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireAdmin, ok } from "@/lib/auth-guard";
import { getStorageInfo } from "@/lib/storage";
import { parseUserAgent } from "@/lib/user-agent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  const storage = getStorageInfo();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    adminCount,
    fileCount,
    dirCount,
    logCount,
    jobPending,
    jobRunning,
    jobFailed,
    activeSessions,
    recentLogs,
    recentUsers,
    sizeAgg,
    logsByDay,
    filesByUser,
    jobsByStatus,
    sessionsRaw,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.backupFile.count({ where: { isDir: false } }),
    prisma.backupFile.count({ where: { isDir: true } }),
    prisma.systemLog.count(),
    prisma.backgroundJob.count({ where: { status: "PENDING" } }),
    prisma.backgroundJob.count({ where: { status: "RUNNING" } }),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.systemLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
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
        _count: { select: { backupFiles: true, sessions: true } },
      },
    }),
    prisma.backupFile.aggregate({
      _sum: { size: true },
      where: { isDir: false },
    }),
    prisma.systemLog.findMany({
      where: { timestamp: { gte: weekAgo } },
      select: { timestamp: true, level: true, type: true },
      orderBy: { timestamp: "asc" },
      take: 2000,
    }),
    prisma.backupFile.groupBy({
      by: ["userId"],
      where: { isDir: false },
      _sum: { size: true },
      _count: { _all: true },
      orderBy: { _sum: { size: "desc" } },
      take: 8,
    }),
    prisma.backgroundJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.session.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    }),
  ]);

  // Activity last 7 days (by date)
  const dayMap = new Map<
    string,
    { date: string; total: number; error: number; login: number }
  >();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, total: 0, error: 0, login: 0 });
  }
  for (const l of logsByDay) {
    const key = new Date(l.timestamp).toISOString().slice(0, 10);
    const row = dayMap.get(key);
    if (!row) continue;
    row.total += 1;
    if (l.level === "ERROR") row.error += 1;
    if (l.type === "LOGIN") row.login += 1;
  }

  const userIds = filesByUser.map((f) => f.userId);
  const usersForFiles = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = Object.fromEntries(usersForFiles.map((u) => [u.id, u]));

  const storageByUser = filesByUser.map((f) => ({
    userId: f.userId,
    name: userById[f.userId]?.name || "Unknown",
    email: userById[f.userId]?.email || "",
    files: f._count._all,
    bytes: Number(f._sum.size || 0),
  }));

  const sessions = sessionsRaw.map((s) => {
    const device = parseUserAgent(s.userAgent);
    return {
      id: s.id,
      user: s.user,
      ipAddress: s.ipAddress,
      deviceName: device.deviceName,
      browser: device.browser,
      os: device.os,
      deviceType: device.deviceType,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
    };
  });

  const logsLast24h = await prisma.systemLog.count({
    where: { timestamp: { gte: dayAgo } },
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
      directories: dirCount,
      logs: logCount,
      logsLast24h,
      totalBytes: Number(sizeAgg._sum.size || 0),
      activeSessions,
      jobs: {
        pending: jobPending,
        running: jobRunning,
        failed: jobFailed,
      },
    },
    storage,
    charts: {
      activity: Array.from(dayMap.values()),
      storageByUser,
      jobsByStatus: jobsByStatus.map((j) => ({
        status: j.status,
        count: j._count._all,
      })),
    },
    recentLogs,
    recentUsers,
    sessions,
  });
}
