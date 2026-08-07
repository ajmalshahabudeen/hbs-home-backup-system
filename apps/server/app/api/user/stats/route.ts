import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;

  const files = await prisma.backupFile.findMany({
    where: {
      userId,
      isDir: false,
      NOT: [
        { name: { contains: ".hbs-thumb" } },
        { path: { contains: ".hbs-thumb" } },
      ],
    },
    select: { size: true, mimeType: true },
  });

  let totalBytes = 0;
  let photoCount = 0;
  let videoCount = 0;
  let docCount = 0;
  let otherCount = 0;

  for (const f of files) {
    const sz = Number(f.size);
    totalBytes += sz;
    const mime = f.mimeType || "";
    if (mime.startsWith("image/")) photoCount++;
    else if (mime.startsWith("video/")) videoCount++;
    else if (
      mime.startsWith("text/") ||
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("json")
    )
      docCount++;
    else otherCount++;
  }

  return ok({
    totalBytes,
    fileCount: files.length,
    photoCount,
    videoCount,
    docCount,
    otherCount,
  });
}
