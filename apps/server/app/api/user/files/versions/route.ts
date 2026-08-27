import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireSession } from "@/lib/auth-guard";
import { resolveUserPath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/files/versions",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const fileId = new URL(request.url).searchParams.get("id") || "";
    if (!fileId) return badRequest("id required");
    const file = await prisma.backupFile.findFirst({
      where: { id: fileId, userId: session.user.id },
    });
    if (!file) return badRequest("File not found");
    const versions = await prisma.fileVersion.findMany({
      where: { fileId, userId: session.user.id },
      orderBy: { version: "desc" },
    });
    return ok({
      file: { ...file, size: Number(file.size) },
      versions: versions.map((v) => ({
        ...v,
        size: Number(v.size),
        createdAt: v.createdAt.toISOString(),
      })),
    });
  },
);

export const POST = withApiLog(
  "POST /api/user/files/versions",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const body = (await request.json()) as {
      fileId?: string;
      version?: number;
    };
    if (!body.fileId || !body.version)
      return badRequest("fileId and version required");
    const file = await prisma.backupFile.findFirst({
      where: { id: body.fileId, userId: session.user.id },
    });
    const ver = await prisma.fileVersion.findFirst({
      where: {
        fileId: body.fileId,
        version: Number(body.version),
        userId: session.user.id,
      },
    });
    if (!file || !ver) return badRequest("Version not found");
    const currentAbs = resolveUserPath(session.user.id, file.path);
    const verAbs = resolveUserPath(session.user.id, ver.path);
    if (!fs.existsSync(verAbs)) return badRequest("Version missing on disk");
    fs.mkdirSync(path.dirname(currentAbs), { recursive: true });
    fs.copyFileSync(verAbs, currentAbs);
    const size = fs.statSync(currentAbs).size;
    const updated = await prisma.backupFile.update({
      where: { id: file.id },
      data: { size: BigInt(size), name: ver.name },
    });
    return ok({ file: { ...updated, size: Number(updated.size) } });
  },
);
