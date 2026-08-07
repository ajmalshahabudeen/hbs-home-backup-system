import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;

  try {
    const body = await request.json();
    const { name, size, checksum, path: reqPath } = body || {};

    if (!name && !reqPath) {
      return badRequest("File name or path required for duplicate check");
    }

    // Try finding existing file by exact user + path or user + name + size
    let existing = null;

    if (reqPath) {
      existing = await prisma.backupFile.findUnique({
        where: {
          userId_path: { userId, path: reqPath },
        },
      });
    }

    if (!existing && name && size != null) {
      existing = await prisma.backupFile.findFirst({
        where: {
          userId,
          name: String(name),
          size: BigInt(size),
          ...(checksum ? { checksum: String(checksum) } : {}),
        },
      });
    }

    if (existing) {
      return ok({
        duplicate: true,
        file: {
          ...existing,
          size: Number(existing.size),
        },
      });
    }

    return ok({ duplicate: false, file: null });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Deduplication check failed");
  }
}
