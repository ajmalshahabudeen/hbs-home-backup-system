import { NextRequest } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@workspace/db";
import { requireSession, badRequest } from "@/lib/auth-guard";
import { resolveUserPath, toPosixRel } from "@/lib/storage";
import { getOrCreateThumbnail } from "@/lib/thumbnails";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startRaw = match[1];
  const endRaw = match[2];
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : size - 1;
  if (!startRaw && endRaw) {
    const suffix = Number(endRaw);
    start = Math.max(size - suffix, 0);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const params = await context.params;
  const rawPath = params.path ? params.path.map(decodeURIComponent).join("/") : "";
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

    const stat = fs.statSync(/* turbopackIgnore: true */ abs);
    const size = stat.size;
    const rangeHeader = request.headers.get("range");
    const contentType = file.mimeType || "application/octet-stream";

    if (rangeHeader) {
      const range = parseRange(rangeHeader, size);
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      const stream = fs.createReadStream(/* turbopackIgnore: true */ abs, {
        start: range.start,
        end: range.end,
      });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

    const stream = fs.createReadStream(/* turbopackIgnore: true */ abs);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
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
