import { randomBytes } from "node:crypto";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/links",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const links = await prisma.publicShareLink.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    return ok({
      links: links.map((l) => ({
        ...l,
        expiresAt: l.expiresAt.toISOString(),
        createdAt: l.createdAt.toISOString(),
      })),
    });
  },
);

export const POST = withApiLog(
  "POST /api/user/links",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const body = (await request.json()) as { fileId?: string; hours?: number };
    const fileId = String(body.fileId || "");
    const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 24 * 30);
    if (!fileId) return badRequest("fileId required");
    const file = await prisma.backupFile.findFirst({
      where: { id: fileId, userId: session.user.id, isDir: false },
    });
    if (!file) return badRequest("File not found");
    const token = randomBytes(18).toString("base64url");
    const row = await prisma.publicShareLink.create({
      data: {
        token,
        userId: session.user.id,
        fileId,
        expiresAt: new Date(Date.now() + hours * 3600_000),
      },
    });
    return ok({ link: { ...row, path: `/s/${token}` } }, { status: 201 });
  },
);

export const DELETE = withApiLog(
  "DELETE /api/user/links",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return badRequest("id required");
    await prisma.publicShareLink.deleteMany({
      where: { id, userId: session.user.id },
    });
    return ok({ deleted: true });
  },
);
