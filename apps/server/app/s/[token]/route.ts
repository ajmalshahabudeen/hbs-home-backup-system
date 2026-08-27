import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { decryptAtRestToBuffer } from "@/lib/at-rest";
import { resolveUserPath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /s/[token]",
  async (
    _request: NextRequest,
    context: { params: Promise<{ token: string }> },
  ) => {
    const { token } = await context.params;
    const link = await prisma.publicShareLink.findUnique({ where: { token } });
    if (!link || link.expiresAt.getTime() <= Date.now()) {
      return new Response("Link expired or not found", { status: 404 });
    }
    const file = await prisma.backupFile.findFirst({
      where: { id: link.fileId, userId: link.userId },
    });
    if (!file || file.isDir)
      return new Response("File missing", { status: 404 });
    const abs = resolveUserPath(link.userId, file.path);
    if (!fs.existsSync(abs))
      return new Response("File missing", { status: 404 });
    const head = Buffer.alloc(4);
    const fd = fs.openSync(abs, "r");
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (head.toString("utf8") === "HBS2") {
      const plain = await decryptAtRestToBuffer(abs);
      return new Response(new Uint8Array(plain), {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
          "Content-Length": String(plain.length),
        },
      });
    }
    const stat = fs.statSync(abs);
    const stream = fs.createReadStream(abs);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
        "Content-Length": String(stat.size),
      },
    });
  },
);
