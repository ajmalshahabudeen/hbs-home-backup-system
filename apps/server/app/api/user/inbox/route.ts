import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import { requireSession, ok } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
  const events = await prisma.inboxEvent.findMany({
    where: { userId: session.user.id, ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({ events });
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  await prisma.inboxEvent.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });
  return ok({ ok: true });
}
