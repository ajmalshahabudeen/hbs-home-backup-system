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
  const filter = searchParams.get("filter") || searchParams.get("category");
  const limitRaw = Number(searchParams.get("limit") || 80);
  const offsetRaw = Number(searchParams.get("offset") || 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const where = {
    userId,
    isDir: false,
    NOT: [{ name: { contains: ".hbs-thumb" } }, { path: { contains: ".hbs-thumb" } }, { path: { startsWith: "Trash/" } }],
    OR:
      filter === "videos"
        ? [{ mimeType: { startsWith: "video/" } }]
        : filter === "photos"
          ? [{ mimeType: { startsWith: "image/" } }]
          : [{ mimeType: { startsWith: "image/" } }, { mimeType: { startsWith: "video/" } }],
  };

  const [total, files] = await Promise.all([
    prisma.backupFile.count({ where }),
    prisma.backupFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);

  const mediaList = files.map((f) => {
    const enc = f.path
      .split("/")
      .map((p) => encodeURIComponent(p))
      .join("/");
    const base = `/api/user/media/${enc}`;
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
      url: base,
      thumbUrl: `${base}?thumb=1`,
    };
  });

  return ok({
    total,
    offset,
    limit,
    hasMore: offset + files.length < total,
    media: mediaList,
  });
}
