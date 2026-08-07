import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      client.on("error", (err) => {
        console.warn("[HBS][REDIS]", err.message);
      });
    } catch (e) {
      console.warn("[HBS][REDIS] init failed", e);
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
    return v;
  } catch {
    return null;
  }
}

export async function redisSetBuffer(
  key: string,
  value: Buffer,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.set(key, value, "EX", ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function redisPing(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  }
}
