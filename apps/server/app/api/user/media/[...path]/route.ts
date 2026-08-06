import { NextRequest } from "next/server";
import fs from "node:fs";
import { prisma } from "@workspace/db";
import { requireSession, badRequest } from "@/lib/auth-guard";
import { resolveUserPath, toPosixRel } from "@/lib/storage";

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
  const rawPath = params.path ? params.path.map(decodeURIComponent).join("/") : "";
  const relPath = toPosixRel(rawPath);

  if (!relPath) return badRequest("Path required");

  const file = await prisma.backupFile.findFirst({
    where: { userId, path: relPath },
  });

  if (!file || file.isDir) {
    return badRequest("File not found");
  }

  try {
    const abs = resolveUserPath(userId, file.path);
    if (!fs.existsSync(abs)) return badRequest("File missing on disk");

    const buf = fs.readFileSync(abs);
    return new Response(buf, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Media read error");
  }
}
