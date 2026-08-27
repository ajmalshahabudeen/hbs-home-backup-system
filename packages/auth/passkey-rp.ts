import { AsyncLocalStorage } from "node:async_hooks";

const rpStore = new AsyncLocalStorage<string>();
const originStore = new AsyncLocalStorage<string>();

export function hostnameFromHostHeader(host: string): string {
  const raw = host.trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end > 0 ? raw.slice(1, end) : raw;
  }
  return raw.split("%")[0]?.split(":")[0] || raw;
}

export function runWithPasskeyRequestContext<T>(
  host: string,
  originHeader: string | null,
  fn: () => T,
): T {
  const hostname = hostnameFromHostHeader(host);
  const origin =
    originHeader && originHeader !== "null"
      ? originHeader
      : host
        ? `http://${host}`
        : "";
  return rpStore.run(hostname, () => originStore.run(origin, fn));
}

function envRp(): string {
  const fromEnv = (process.env.HBS_PASSKEY_RP_ID || "").trim();
  if (fromEnv) return fromEnv;
  const fallback =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:38480";
  try {
    return new URL(fallback).hostname || "localhost";
  } catch {
    return "localhost";
  }
}

export function getPasskeyRpID(): string {
  const live = rpStore.getStore();
  if (live) return live;
  return envRp() || "localhost";
}

export function getPasskeyOrigin(): string | string[] | undefined {
  const req = originStore.getStore();
  const extra = (process.env.HBS_PASSKEY_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = [...new Set([req, ...extra].filter(Boolean))] as string[];
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return list;
}
