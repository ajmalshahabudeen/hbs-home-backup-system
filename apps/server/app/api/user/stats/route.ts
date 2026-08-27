import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { ok, requireSession } from "@/lib/auth-guard";
import { getStorageInfo } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/stats",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;

    const files = await prisma.backupFile.findMany({
      where: {
        userId,
        isDir: false,
        NOT: [
          { name: { contains: ".hbs-thumb" } },
          { path: { contains: ".hbs-thumb" } },
        ],
      },
      select: { size: true, mimeType: true },
    });

    let totalBytes = 0;
    let photoCount = 0;
    let videoCount = 0;
    let docCount = 0;
    let otherCount = 0;

    for (const f of files) {
      const sz = Number(f.size);
      totalBytes += sz;
      const mime = f.mimeType || "";
      if (mime.startsWith("image/")) photoCount++;
      else if (mime.startsWith("video/")) videoCount++;
      else if (
        mime.startsWith("text/") ||
        mime.includes("pdf") ||
        mime.includes("document") ||
        mime.includes("json")
      )
        docCount++;
      else otherCount++;
    }

    // Use authoritative HBS storage engine to query exact external hard drive metrics
    const storageInfo = getStorageInfo();
    const diskTotalBytes = storageInfo.disk.totalBytes || 0;
    const diskFreeBytes = storageInfo.disk.freeBytes || 0;
    const driveName = storageInfo.name || "Backup Drive";
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuotaBytes: true },
    });
    const quotaBytes = me?.storageQuotaBytes
      ? Number(me.storageQuotaBytes)
      : diskTotalBytes > 0
        ? diskTotalBytes
        : 100 * 1024 * 1024 * 1024;

    return ok({
      totalBytes,
      fileCount: files.length,
      photoCount,
      videoCount,
      docCount,
      otherCount,
      diskTotalBytes,
      diskFreeBytes,
      driveName,
      quotaBytes,
      usedBytes: totalBytes,
    });
  },
);
