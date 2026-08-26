import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const albumId = new URL(request.url).searchParams.get("id") || "";
  if (!albumId) return badRequest("id required");
  const album = await prisma.personAlbum.findFirst({
    where: { id: albumId, userId: session.user.id },
  });
  if (!album) return badRequest("Album not found");
  const items = await prisma.personAlbumItem.findMany({
    where: { albumId },
    orderBy: { addedAt: "desc" },
  });
  const files = items.length
    ? await prisma.backupFile.findMany({
        where: { userId: session.user.id, id: { in: items.map((i) => i.fileId) } },
      })
    : [];
  const byId = Object.fromEntries(files.map((f) => [f.id, f]));
  return ok({
    album,
    files: items
      .map((i) => byId[i.fileId])
      .filter(Boolean)
      .map((f) => ({ ...f!, size: Number(f!.size) })),
  });
}
