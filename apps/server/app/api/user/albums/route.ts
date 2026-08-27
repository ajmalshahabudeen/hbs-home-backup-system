import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { ok, requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/albums",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const rows = await prisma.backupFile.findMany({
      where: {
        userId: session.user.id,
        isDir: false,
        OR: [
          { mimeType: { startsWith: "image/" } },
          { mimeType: { startsWith: "video/" } },
        ],
      },
      select: { parentPath: true, mimeType: true },
    });
    const counts = new Map<string, { photos: number; videos: number }>();
    for (const row of rows) {
      const key = row.parentPath || "Camera";
      const cur = counts.get(key) ?? { photos: 0, videos: 0 };
      if ((row.mimeType || "").startsWith("video/")) cur.videos += 1;
      else cur.photos += 1;
      counts.set(key, cur);
    }
    const albums = Array.from(counts.entries())
      .map(([path, c]) => ({
        id: path || "root",
        name: path ? path.split("/").pop() || path : "All photos",
        path,
        photoCount: c.photos,
        videoCount: c.videos,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return ok({ albums });
  },
);
