import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiLog(
  "GET /api/user/inbox/stream",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const encoder = new TextEncoder();
    let lastSeen = new Date(0);
    let timer: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const tick = async () => {
          try {
            const events = await prisma.inboxEvent.findMany({
              where: {
                userId: session.user.id,
                read: false,
                createdAt: { gt: lastSeen },
              },
              orderBy: { createdAt: "asc" },
              take: 20,
            });
            if (events.length) {
              lastSeen = events[events.length - 1]!.createdAt;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ events })}\n\n`),
              );
            } else {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            }
          } catch {
            /* keep the stream alive */
          }
        };
        void tick();
        timer = setInterval(() => void tick(), 2500);
        request.signal.addEventListener("abort", () => {
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel() {
        if (timer) clearInterval(timer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  },
);
