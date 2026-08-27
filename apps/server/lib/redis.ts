import Redis from "ioredis";
import { term } from "@/lib/term-log";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    try {
      term("REDIS", "connecting", { url: url.replace(/:[^:@/]+@/, ":***@") });
      client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      client.on("error", (err) => {
        term("WARN", "redis error", { err: err.message });
      });
      client.on("connect", () => term("REDIS", "socket connected"));
      client.on("ready", () => term("REDIS", "ready"));
    } catch (e) {
      term("WARN", "redis init failed", {
        err: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }
  return client;
}

export async function redisGetBuffer(key: string): Promise<Buffer | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.getBuffer(key);
    term("REDIS", v ? "GET HIT" : "GET MISS", { key, bytes: v?.length ?? 0 });
    return v;
  } catch (err) {
    term("WARN", "GET failed", {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function redisSetBuffer(
  key: string,
  value: Buffer,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.set(key, value, "EX", ttlSeconds);
    term("REDIS", "SET", { key, bytes: value.length, ttlSeconds });
    return true;
  } catch (err) {
    term("WARN", "SET failed", {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function redisPing(): Promise<boolean> {
  const r = getRedis();
  if (!r) {
    term("REDIS", "PING skipped (no client)");
    return false;
  }
  try {
    const ok = (await r.ping()) === "PONG";
    term("REDIS", ok ? "PING PONG" : "PING unexpected");
    return ok;
  } catch (err) {
    term("WARN", "PING failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
