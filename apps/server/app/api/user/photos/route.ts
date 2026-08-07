import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, extractSessionToken } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter"); // 'all' | 'photos' | 'videos'
  const token = extractSessionToken(request) || "";

  const files = await prisma.backupFile.findMany({
    where: {
      userId,
      isDir: false,
      OR:
        filter === "videos"
          ? [{ mimeType: { startsWith: "video/" } }]
          : filter === "photos"
            ? [{ mimeType: { startsWith: "image/" } }]
            : [
                { mimeType: { startsWith: "image/" } },
                { mimeType: { startsWith: "video/" } },
              ],
    },
    orderBy: { createdAt: "desc" },
  });

  const mediaList = files.map((f) => {
    const enc = f.path
      .split("/")
      .map((p) => encodeURIComponent(p))
      .join("/");
    const base = `/api/user/media/${enc}`;
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    const thumbQ = token
      ? `?token=${encodeURIComponent(token)}&thumb=1`
      : `?thumb=1`;
    return {
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
      url: `${base}${q}`,
      thumbUrl: `${base}${thumbQ}`,
    };
  });

  return ok({
    total: mediaList.length,
    media: mediaList,
  });
}
