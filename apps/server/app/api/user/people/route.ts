import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { badRequest, ok, requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/people",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const albums = await prisma.personAlbum.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
    return ok({
      albums: albums.map((a) => ({
        id: a.id,
        name: a.name,
        count: a._count.items,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  },
);

export const POST = withApiLog(
  "POST /api/user/people",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const body = (await request.json()) as { name?: string };
    const name = String(body.name || "").trim();
    if (!name) return badRequest("name required");
    const album = await prisma.personAlbum.create({
      data: { userId: session.user.id, name },
    });
    return ok({ album }, { status: 201 });
  },
);

export const PATCH = withApiLog(
  "PATCH /api/user/people",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const body = (await request.json()) as {
      id?: string;
      fileId?: string;
      remove?: boolean;
    };
    if (!body.id || !body.fileId) return badRequest("id and fileId required");
    const album = await prisma.personAlbum.findFirst({
      where: { id: body.id, userId: session.user.id },
    });
    if (!album) return badRequest("Album not found");
    if (body.remove) {
      await prisma.personAlbumItem.deleteMany({
        where: { albumId: album.id, fileId: body.fileId },
      });
      return ok({ removed: true });
    }
    await prisma.personAlbumItem.upsert({
      where: { albumId_fileId: { albumId: album.id, fileId: body.fileId } },
      create: { albumId: album.id, fileId: body.fileId },
      update: {},
    });
    return ok({ added: true });
  },
);

export const DELETE = withApiLog(
  "DELETE /api/user/people",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return badRequest("id required");
    await prisma.personAlbum.deleteMany({
      where: { id, userId: session.user.id },
    });
    return ok({ deleted: true });
  },
);
