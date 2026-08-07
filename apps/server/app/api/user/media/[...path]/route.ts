import { NextRequest } from "next/server";
import fs from "node:fs";
import { prisma } from "@workspace/db";
import { requireSession, badRequest } from "@/lib/auth-guard";
import { resolveUserPath, toPosixRel } from "@/lib/storage";
import { getOrCreateThumbnail } from "@/lib/thumbnails";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const params = await context.params;
  const rawPath = params.path
    ? params.path.map(decodeURIComponent).join("/")
    : "";
  const relPath = toPosixRel(rawPath);
  const wantThumb =
    request.nextUrl.searchParams.get("thumb") === "1" ||
    request.nextUrl.searchParams.get("thumbnail") === "1";

  if (!relPath) return badRequest("Path required");

  const file = await prisma.backupFile.findFirst({
    where: { userId, path: relPath },
  });

  if (!file || file.isDir) {
    return badRequest("File not found");
  }

  try {
    const abs = resolveUserPath(userId, file.path);
    if (!fs.existsSync(/* turbopackIgnore: true */ abs)) {
      return badRequest("File missing on disk");
    }

    if (wantThumb) {
      const thumb = await getOrCreateThumbnail({
        userId,
        relPath: file.path,
        absPath: abs,
        mimeType: file.mimeType,
      });
      return new Response(new Uint8Array(thumb.buffer), {
        headers: {
          "Content-Type": thumb.contentType,
          "Content-Length": String(thumb.buffer.length),
          "Cache-Control": "private, max-age=604800",
          "X-HBS-Thumb-Cache": thumb.cached ? "HIT" : "MISS",
        },
      });
    }

    const buf = fs.readFileSync(/* turbopackIgnore: true */ abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    await logAction({
      type: "MEDIA",
      level: "ERROR",
      status: "FAILURE",
      message: `Media read failed: ${relPath}`,
      userId,
      userEmail: session.user.email,
      metadata: { error: e instanceof Error ? e.message : String(e) },
    });
    return badRequest(e instanceof Error ? e.message : "Media read error");
  }
}
