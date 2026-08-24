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
    const name = body?.name || body?.fileName || "";
    const size = body?.size ?? body?.fileSize;
    const checksum = body?.checksum || body?.hash || "";
    const reqPath = body?.path || body?.targetFilePath || body?.reqPath || "";

    if (!name && !reqPath) {
      return badRequest("File name or path required for duplicate check");
    }

    let targetPath = reqPath ? String(reqPath).trim() : "";
    if (name && targetPath && !targetPath.endsWith(String(name))) {
      targetPath = `${targetPath}/${name}`;
    } else if (!targetPath && name) {
      targetPath = String(name);
    }

    let existing = null;

    if (targetPath) {
      existing = await prisma.backupFile.findFirst({
        where: {
          userId,
          path: targetPath,
          isDir: false,
        },
      });
    }

    if (!existing && name && size != null && BigInt(size) > 0n) {
      existing = await prisma.backupFile.findFirst({
        where: {
          userId,
          name: String(name),
          size: BigInt(size),
          isDir: false,
          ...(checksum ? { checksum: String(checksum) } : {}),
        },
      });
    }

    if (existing && !existing.isDir) {
      const fileData = {
        ...existing,
        size: Number(existing.size),
      };
      return ok({
        duplicate: true,
        isDuplicate: true,
        file: fileData,
        existingFile: fileData,
      });
    }

    return ok({
      duplicate: false,
      isDuplicate: false,
      file: null,
      existingFile: null,
    });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Deduplication check failed");
  }
}
