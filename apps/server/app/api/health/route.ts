import { NextRequest } from "next/server";
import { ok } from "@/lib/auth-guard";
import { ensureStorageReady, getStorageRoot } from "@/lib/storage";
import { prisma } from "@workspace/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function redisPing(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  try {
    // Lightweight TCP-ish check via fetch not available for redis protocol.
    // Use dynamic import of ioredis if present; else spawn is overkill — mark unknown.
    const { createConnection } = await import("node:net");
    const u = new URL(url);
    const host = u.hostname || "127.0.0.1";
    const port = Number(u.port || 6379);
    return await new Promise((resolve) => {
      const socket = createConnection({ host, port }, () => {
        socket.write("PING\r\n");
      });
      let data = "";
      socket.setTimeout(2000);
      socket.on("data", (buf) => {
        data += buf.toString();
        if (data.includes("+PONG") || data.includes("PONG")) {
          socket.end();
          resolve(true);
        }
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/** Cheap health endpoint for Docker / run.sh probes (public). */
export async function GET(_request: NextRequest) {
  const storage = ensureStorageReady();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const redisOk = await redisPing();

  // optional cached stats
  let jobs: { pending: number; running: number } | null = null;
  try {
    const [pending, running] = await Promise.all([
      prisma.backgroundJob.count({ where: { status: "PENDING" } }),
      prisma.backgroundJob.count({ where: { status: "RUNNING" } }),
    ]);
    jobs = { pending, running };
  } catch {
    jobs = null;
  }

  return ok({
    ok: dbOk && storage.ok,
    service: "hbs-server",
    time: new Date().toISOString(),
    database: dbOk ? "up" : "down",
    redis: redisOk ? "up" : "down",
    queueBackend: process.env.QUEUE_BACKEND || "celery",
    jobs,
    storage: {
      ok: storage.ok,
      root: storage.root || getStorageRoot(),
      error: storage.error,
    },
  });
}
