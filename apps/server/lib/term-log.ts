/**
 * Pretty Docker/terminal logger for HBS Cloud.
 * Always prints (FORCE_COLOR in the image). Never writes secrets.
 * Request-scoped id is stored in AsyncLocalStorage when running on Node.
 */

export type LogTag =
  | "BOOT"
  | "REQ"
  | "RES"
  | "AUTH"
  | "FN"
  | "FS"
  | "DB"
  | "REDIS"
  | "QUEUE"
  | "PY"
  | "MEDIA"
  | "THUMB"
  | "JOB"
  | "SCAN"
  | "PUSH"
  | "INBOX"
  | "QUOTA"
  | "DAV"
  | "SHARE"
  | "HEALTH"
  | "SYS"
  | "WARN"
  | "ERROR"
  | "TRACE"
  | "OK"
  | "OUT";

type Level = "trace" | "debug" | "info" | "warn" | "error";

type LogCtx = { reqId: string; route: string };

const SECRET_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[_-]?key|credential|at[_-]?rest|bearer/i;

const TAG_COLOR: Record<LogTag, string> = {
  BOOT: "\x1b[1;95m",
  REQ: "\x1b[1;36m",
  RES: "\x1b[1;32m",
  AUTH: "\x1b[1;35m",
  FN: "\x1b[1;94m",
  FS: "\x1b[1;34m",
  DB: "\x1b[1;33m",
  REDIS: "\x1b[1;31m",
  QUEUE: "\x1b[1;93m",
  PY: "\x1b[1;93m",
  MEDIA: "\x1b[1;96m",
  THUMB: "\x1b[1;96m",
  JOB: "\x1b[1;93m",
  SCAN: "\x1b[1;92m",
  PUSH: "\x1b[1;95m",
  INBOX: "\x1b[1;95m",
  QUOTA: "\x1b[1;33m",
  DAV: "\x1b[1;36m",
  SHARE: "\x1b[1;35m",
  HEALTH: "\x1b[1;90m",
  SYS: "\x1b[1;37m",
  WARN: "\x1b[1;33m",
  ERROR: "\x1b[1;91m",
  TRACE: "\x1b[90m",
  OK: "\x1b[1;32m",
  OUT: "\x1b[1;37m",
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";

function colorEnabled(): boolean {
  const v = (
    process.env.HBS_LOG_COLOR ||
    process.env.FORCE_COLOR ||
    "1"
  ).trim();
  if (v === "0" || v.toLowerCase() === "false" || process.env.NO_COLOR) {
    return false;
  }
  return true;
}

function c(code: string, text: string): string {
  return colorEnabled() ? `${code}${text}${RESET}` : text;
}

function levelRank(l: Level): number {
  switch (l) {
    case "trace":
      return 10;
    case "debug":
      return 20;
    case "info":
      return 30;
    case "warn":
      return 40;
    case "error":
      return 50;
  }
}

function configuredLevel(): Level {
  const raw = (process.env.HBS_LOG_LEVEL || "trace").toLowerCase();
  if (
    raw === "debug" ||
    raw === "info" ||
    raw === "warn" ||
    raw === "error" ||
    raw === "trace"
  ) {
    return raw;
  }
  return "trace";
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function shortId(): string {
  return Math.random().toString(16).slice(2, 8);
}

type AlsLike = {
  getStore: () => LogCtx | undefined;
  run: <T>(ctx: LogCtx, fn: () => T) => T;
};

const g = globalThis as unknown as { __hbsLogAls?: AlsLike };

function getAls(): AlsLike | null {
  if (process.env.NEXT_RUNTIME === "edge") return null;
  if (g.__hbsLogAls) return g.__hbsLogAls;
  try {
    // Lazy so Edge middleware never loads async_hooks.
    const { AsyncLocalStorage } = require("node:async_hooks") as {
      AsyncLocalStorage: new () => AlsLike;
    };
    g.__hbsLogAls = new AsyncLocalStorage();
    return g.__hbsLogAls;
  } catch {
    return null;
  }
}

export function currentReqId(): string | undefined {
  return getAls()?.getStore()?.reqId;
}

export function runWithLogContext<T>(ctx: LogCtx, fn: () => T): T {
  const als = getAls();
  if (!als) return fn();
  return als.run(ctx, fn);
}

export function newReqId(): string {
  return shortId();
}

function tagOf(type: string): LogTag {
  const t = type.toUpperCase();
  if ((TAG_COLOR as Record<string, string>)[t]) return t as LogTag;
  if (t.includes("AUTH") || t.includes("SESSION") || t.includes("LOGIN"))
    return "AUTH";
  if (t.includes("UPLOAD") || t.includes("FILE") || t.includes("FS"))
    return "FS";
  if (t.includes("REDIS") || t.includes("CACHE")) return "REDIS";
  if (t.includes("QUEUE") || t.includes("CELERY") || t.includes("JOB"))
    return "JOB";
  if (t.includes("PYTHON") || t.includes("PY") || t.includes("FFMPEG"))
    return "PY";
  if (t.includes("THUMB")) return "THUMB";
  if (t.includes("MEDIA") || t.includes("PHOTO")) return "MEDIA";
  if (t.includes("SCAN")) return "SCAN";
  if (t.includes("QUOTA")) return "QUOTA";
  if (t.includes("INBOX") || t.includes("PUSH")) return "INBOX";
  if (t.includes("DAV")) return "DAV";
  if (t.includes("SHARE") || t.includes("LINK")) return "SHARE";
  if (t.includes("HEALTH")) return "HEALTH";
  if (t.includes("WARN")) return "WARN";
  if (t.includes("ERROR") || t.includes("FAIL")) return "ERROR";
  return "SYS";
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 240) return `${value.slice(0, 237)}…`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `<Buffer ${value.length} bytes>`;
  }
  if (Array.isArray(value)) {
    if (depth > 3) return `[Array ${value.length}]`;
    const head = value.slice(0, 8).map((v) => redact(v, depth + 1));
    if (value.length > 8) head.push(`…+${value.length - 8}`);
    return head;
  }
  if (typeof value === "object") {
    if (depth > 4) return "[Object]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) {
        out[k] = v == null || v === "" ? v : "«redacted»";
        continue;
      }
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function summarize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof Response !== "undefined" && value instanceof Response) {
    return { status: value.status, type: value.headers.get("content-type") };
  }
  if (typeof Error !== "undefined" && value instanceof Error) {
    return { error: value.name, message: value.message };
  }
  return redact(value);
}

function formatMeta(meta: unknown): string {
  if (meta === undefined || meta === "") return "";
  try {
    const cleaned = redact(meta);
    if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) {
      const entries = Object.entries(cleaned as Record<string, unknown>);
      if (entries.length === 0) return "";
      const parts = entries.map(([k, v]) => {
        const val =
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
            ? String(v)
            : JSON.stringify(v);
        return `${k}=${val}`;
      });
      const line = parts.join("  ");
      return line.length > 500 ? `${line.slice(0, 497)}…` : line;
    }
    const s = typeof cleaned === "string" ? cleaned : JSON.stringify(cleaned);
    return s.length > 500 ? `${s.slice(0, 497)}…` : s;
  } catch {
    return String(meta);
  }
}

function levelForTag(tag: LogTag): Level {
  if (tag === "ERROR") return "error";
  if (tag === "WARN") return "warn";
  if (tag === "TRACE" || tag === "FN" || tag === "HEALTH") return "trace";
  if (tag === "REDIS" || tag === "THUMB" || tag === "DB") return "debug";
  return "info";
}

export function term(
  tag: LogTag | string,
  message: string,
  meta?: unknown,
  level?: Level,
) {
  const t = (
    typeof tag === "string" &&
    (TAG_COLOR as Record<string, string>)[tag.toUpperCase()]
      ? (tag.toUpperCase() as LogTag)
      : tagOf(String(tag))
  ) as LogTag;
  const lvl = level ?? levelForTag(t);
  if (levelRank(lvl) < levelRank(configuredLevel())) return;

  const ctx = getAls()?.getStore();
  const reqId = ctx?.reqId ?? "------";
  const color = TAG_COLOR[t] || WHITE;
  const badge = c(color, `[${t.padEnd(6)}]`);
  const brand = c(`${BOLD}${CYAN}`, "HBS");
  const time = c(GRAY, nowStamp());
  const id = c("\x1b[33m", reqId);
  const pipe = c(GRAY, "│");
  const msg = message;
  const metaStr = formatMeta(meta);
  const line = `${brand} ${pipe} ${time} ${pipe} ${id} ${pipe} ${badge} ${msg}`;
  const extra = metaStr ? ` ${c(DIM, metaStr)}` : "";
  const out = `${line}${extra}`;

  if (lvl === "error") console.error(out);
  else if (lvl === "warn") console.warn(out);
  else console.log(out);
}

export function termKv(
  tag: LogTag | string,
  message: string,
  kv: Record<string, unknown>,
) {
  term(tag, message, kv);
}

export function divider(title?: string) {
  if (levelRank("info") < levelRank(configuredLevel())) return;
  const bar = "─".repeat(62);
  if (!title) {
    console.log(c(GRAY, `HBS │ ${bar}`));
    return;
  }
  console.log(
    c(CYAN, `HBS │ ── ${title} ${"─".repeat(Math.max(4, 54 - title.length))}`),
  );
}

export async function traceFn<T>(
  tag: LogTag,
  name: string,
  fn: () => Promise<T> | T,
  meta?: unknown,
): Promise<T> {
  const t0 = Date.now();
  term(tag, `→ ${name}`, meta, "trace");
  try {
    const out = await fn();
    term(
      tag,
      `← ${name}`,
      { ms: Date.now() - t0, out: summarize(out) },
      "trace",
    );
    return out;
  } catch (err) {
    term(
      "ERROR",
      `✗ ${name}`,
      {
        ms: Date.now() - t0,
        err: err instanceof Error ? err.message : String(err),
      },
      "error",
    );
    throw err;
  }
}

export function printBootBanner() {
  const line = (s: string) => console.log(c(`${BOLD}${CYAN}`, s));
  const dim = (s: string) => console.log(c(GRAY, s));
  const row = (k: string, v: string) =>
    console.log(`  ${c(GRAY, k.padEnd(16))} ${c(WHITE, v)}`);

  const redis = process.env.REDIS_URL || "";
  let redisHost = "(unset)";
  try {
    if (redis) redisHost = new URL(redis).host;
  } catch {
    redisHost = "(invalid REDIS_URL)";
  }
  const db = process.env.DATABASE_URL || "";
  let dbHost = "(unset)";
  try {
    if (db) {
      const u = new URL(db.replace(/^postgresql:/, "http:"));
      dbHost = u.host;
    }
  } catch {
    dbHost = "(set)";
  }

  line("");
  line("  ╔══════════════════════════════════════════════════════════╗");
  line("  ║           HBS CLOUD  ·  server diagnostic log            ║");
  line("  ╚══════════════════════════════════════════════════════════╝");
  dim(
    "  Every request, response, lib call, Redis, FS, and job is tagged below.",
  );
  dim("");
  row("time", new Date().toISOString());
  row("pid", String(process.pid));
  row("node", process.version);
  row("port", process.env.PORT || "38480");
  row("log level", configuredLevel());
  row(
    "storage",
    process.env.STORAGE_ROOT || process.env.HOST_STORAGE_PATH || "(default)",
  );
  row("postgres", dbHost);
  row("redis", redisHost);
  row("queue", process.env.QUEUE_BACKEND || "celery");
  row(
    "google oauth",
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? "configured"
      : "missing",
  );
  row(
    "at-rest",
    process.env.HBS_AT_REST_KEY && process.env.HBS_AT_REST_KEY.length >= 16
      ? "on"
      : "off",
  );
  dim("");
  dim(
    "  tags: [REQ] [RES] [AUTH] [FN] [FS] [DB] [REDIS] [QUEUE] [PY] [MEDIA] [JOB]",
  );
  dim("  ────────────────────────────────────────────────────────────────");
  console.log("");
}

export function statusTag(status: number): string {
  if (status >= 500) return c("\x1b[1;91m", String(status));
  if (status >= 400) return c("\x1b[1;33m", String(status));
  if (status >= 300) return c("\x1b[1;36m", String(status));
  if (status >= 200) return c("\x1b[1;32m", String(status));
  return String(status);
}
