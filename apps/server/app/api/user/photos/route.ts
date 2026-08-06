import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter"); // 'all' | 'photos' | 'videos'

  const mimeFilter =
    filter === "videos"
      ? { startsWith: "video/" }
      : filter === "photos"
        ? { startsWith: "image/" }
        : { OR: [{ startsWith: "image/" }, { startsWith: "video/" }] };

  const files = await prisma.backupFile.findMany({
    where: {
      userId,
      isDir: false,
      OR: [
        { mimeType: { startsWith: "image/" } },
        { mimeType: { startsWith: "video/" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  const mediaList = files.map((f) => ({
    id: f.id,
    userId: f.userId,
    path: f.path,
    name: f.name,
    parentPath: f.parentPath,
    mimeType: f.mimeType,
    size: Number(f.size),
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    isVideo: f.mimeType?.startsWith("video/") ?? false,
    url: `/api/user/media/${encodeURIComponent(f.path)}`,
  }));

  return ok({
    total: mediaList.length,
    media: mediaList,
  });
}
