import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { ok, requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NON_MEDIA_EXTENSIONS = new Set([
  "db",
  "tmp",
  "part",
  "crdownload",
  "txt",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  "json",
  "xml",
  "exe",
  "apk",
  "bin",
  "iso",
  "nomedia",
  "bak",
  "log",
]);

export const GET = withApiLog(
  "GET /api/user/photos",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || searchParams.get("category");
    const limitRaw = Number(searchParams.get("limit") || 80);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 80;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const includeDrive = searchParams.get("includeDrive") === "true";

    const where = {
      userId,
      isDir: false,
      NOT: [
        { name: { contains: ".hbs-thumb" } },
        { path: { contains: ".hbs-thumb" } },
        { path: { startsWith: "Trash/" } },
        { path: { startsWith: "/Trash/" } },
      ],
      AND: [
        ...(!includeDrive
          ? [
              {
                OR: [
                  { path: { startsWith: "MobileBackups" } },
                  { path: { startsWith: "/MobileBackups" } },
                  { parentPath: { startsWith: "MobileBackups" } },
                  { parentPath: { startsWith: "/MobileBackups" } },
                ],
              },
            ]
          : []),
        {
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
      ],
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

    const validMediaFiles = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (NON_MEDIA_EXTENSIONS.has(ext)) return false;
      return true;
    });

    const mediaList = validMediaFiles.map((f) => {
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
  },
);
