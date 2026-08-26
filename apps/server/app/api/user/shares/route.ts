import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest } from "@/lib/auth-guard";
import { toPosixRel } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const email = session.user.email.toLowerCase();
  const [owned, received] = await Promise.all([
    prisma.folderShare.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.folderShare.findMany({
      where: {
        OR: [{ sharedWithUserId: session.user.id }, { sharedWithEmail: email }],
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const ownerIds = Array.from(new Set(received.map((s) => s.ownerId)));
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const ownerMap = Object.fromEntries(owners.map((u) => [u.id, u]));
  return ok({
    owned: owned.map((s) => ({
      id: s.id,
      path: s.path,
      sharedWithEmail: s.sharedWithEmail,
      createdAt: s.createdAt.toISOString(),
    })),
    sharedWithMe: received.map((s) => ({
      id: s.id,
      path: s.path,
      ownerId: s.ownerId,
      ownerEmail: ownerMap[s.ownerId]?.email ?? "",
      ownerName: ownerMap[s.ownerId]?.name ?? "",
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const body = (await request.json()) as { email?: string; path?: string };
  const email = String(body.email || "").trim().toLowerCase();
  const folderPath = toPosixRel(body.path || "");
  if (!email || !email.includes("@")) return badRequest("email required");
  if (email === session.user.email.toLowerCase()) return badRequest("Cannot share with yourself");

  const target = await prisma.user.findFirst({ where: { email } });
  const row = await prisma.folderShare.create({
    data: {
      ownerId: session.user.id,
      sharedWithEmail: email,
      sharedWithUserId: target?.id ?? null,
      path: folderPath,
    },
  });
  return ok({ share: row }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return badRequest("id required");
  await prisma.folderShare.deleteMany({
    where: {
      id,
      OR: [{ ownerId: session.user.id }, { sharedWithUserId: session.user.id }],
    },
  });
  return ok({ deleted: true });
}
