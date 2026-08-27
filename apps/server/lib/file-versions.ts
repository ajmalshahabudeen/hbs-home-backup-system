import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import { resolveUserPath, toPosixRel } from "@/lib/storage";
import { term } from "@/lib/term-log";

export function searchNameOf(originalName: string): string {
  return originalName
    .replace(/\.hbsenc$/i, "")
    .trim()
    .toLowerCase();
}

export async function snapshotVersion(opts: {
  userId: string;
  fileId: string;
  name: string;
  relPath: string;
  size: number;
  mimeType?: string | null;
}) {
  const abs = resolveUserPath(opts.userId, opts.relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    term("FS", "snapshotVersion skip (missing file)", {
      fileId: opts.fileId,
      rel: opts.relPath,
    });
    return;
  }
  const last = await prisma.fileVersion.findFirst({
    where: { fileId: opts.fileId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;
  const storedRel = toPosixRel(`.versions/${opts.fileId}/${version}`);
  const dest = resolveUserPath(opts.userId, storedRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  await prisma.fileVersion.create({
    data: {
      userId: opts.userId,
      fileId: opts.fileId,
      version,
      name: opts.name,
      path: storedRel,
      size: BigInt(opts.size),
      mimeType: opts.mimeType ?? null,
    },
  });
  term("FS", "snapshotVersion", {
    fileId: opts.fileId,
    version,
    storedRel,
    size: opts.size,
  });
}
