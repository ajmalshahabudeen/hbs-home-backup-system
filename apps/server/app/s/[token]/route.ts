import { NextRequest } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@workspace/db";
import { resolveUserPath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const link = await prisma.publicShareLink.findUnique({ where: { token } });
  if (!link || link.expiresAt.getTime() <= Date.now()) {
    return new Response("Link expired or not found", { status: 404 });
  }
  const file = await prisma.backupFile.findFirst({
    where: { id: link.fileId, userId: link.userId },
  });
  if (!file || file.isDir) return new Response("File missing", { status: 404 });
  const abs = resolveUserPath(link.userId, file.path);
  if (!fs.existsSync(abs)) return new Response("File missing", { status: 404 });
  const stat = fs.statSync(abs);
  const stream = fs.createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "Content-Length": String(stat.size),
    },
  });
}
