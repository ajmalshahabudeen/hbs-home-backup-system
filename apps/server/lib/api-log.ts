import type { NextRequest } from "next/server";
import {
  divider,
  newReqId,
  redact,
  runWithLogContext,
  statusTag,
  term,
} from "@/lib/term-log";

type AnyHandler = (...args: never[]) => unknown;

const COMPACT =
  /\/api\/health$|\/api\/user\/media\/|\/api\/user\/inbox\/stream$|\/api\/user\/device\/ping$|\/dav\b|\/s\//;

const JSON_BODY = /json|x-www-form-urlencoded|text\/plain/i;

function clientIp(request: NextRequest | undefined): string {
  if (!request) return "-";
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "-"
  );
}

function shortUa(request: NextRequest | undefined): string {
  const ua = request?.headers.get("user-agent") || "-";
  return ua.length > 80 ? `${ua.slice(0, 77)}…` : ua;
}

function queryMap(
  request: NextRequest | undefined,
): Record<string, string> | undefined {
  if (!request) return undefined;
  const out: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => {
    if (/token|session|password|secret/i.test(k)) out[k] = "«redacted»";
    else out[k] = v.length > 120 ? `${v.slice(0, 117)}…` : v;
  });
  return Object.keys(out).length ? out : undefined;
}

async function peekBody(request: NextRequest | undefined): Promise<unknown> {
  if (!request) return undefined;
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  ) {
    return undefined;
  }
  const ctype = request.headers.get("content-type") || "";
  const len = request.headers.get("content-length");
  if (/multipart\/form-data/i.test(ctype)) {
    return { type: "multipart", bytes: len ? Number(len) : undefined };
  }
  if (!JSON_BODY.test(ctype)) {
    return ctype || len
      ? { type: ctype || "binary", bytes: len ? Number(len) : undefined }
      : undefined;
  }
  const n = len ? Number(len) : 0;
  if (n > 8_000)
    return { type: ctype, bytes: n, skipped: "too large to print" };
  try {
    const clone = request.clone();
    const text = await clone.text();
    if (!text) return undefined;
    try {
      return redact(JSON.parse(text));
    } catch {
      return text.length > 400 ? `${text.slice(0, 397)}…` : text;
    }
  } catch {
    return { type: ctype, note: "body unreadable" };
  }
}

function isRequestLike(v: unknown): v is NextRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    "headers" in v &&
    "method" in v &&
    typeof (v as { method?: unknown }).method === "string"
  );
}

function isResponseLike(v: unknown): v is Response {
  return typeof Response !== "undefined" && v instanceof Response;
}

/**
 * Wrap a Next.js App Router handler. Logs request in, response out, duration,
 * and bubbles the same req-id into every nested term() call.
 */
export function withApiLog<T extends AnyHandler>(name: string, handler: T): T {
  const wrapped = (async (...args: unknown[]) => {
    const request = isRequestLike(args[0])
      ? (args[0] as NextRequest)
      : undefined;
    const reqId = newReqId();
    const method = request?.method || name.split(" ")[0] || "CALL";
    const path = request?.nextUrl?.pathname || name;
    const compact = COMPACT.test(path);
    const t0 = Date.now();

    return runWithLogContext({ reqId, route: name }, async () => {
      if (!compact) divider();
      const qs = queryMap(request);
      const body = compact ? undefined : await peekBody(request);
      term(
        path.includes("/health") ? "HEALTH" : "REQ",
        `${method} ${path}`,
        compact
          ? { ip: clientIp(request) }
          : {
              route: name,
              ip: clientIp(request),
              ua: shortUa(request),
              qs,
              body,
            },
      );

      try {
        const result = await handler(...(args as never[]));
        const ms = Date.now() - t0;
        if (isResponseLike(result)) {
          const status = result.status;
          const ctype = result.headers.get("content-type") || undefined;
          const clen = result.headers.get("content-length") || undefined;
          const tag = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "RES";
          term(
            tag,
            `${method} ${path}  →  ${statusTag(status)}  ${ms}ms`,
            compact ? undefined : { type: ctype, bytes: clen },
          );
        } else {
          term("RES", `${method} ${path}  →  done  ${ms}ms`);
        }
        return result;
      } catch (err) {
        const ms = Date.now() - t0;
        term(
          "ERROR",
          `${method} ${path}  →  threw  ${ms}ms`,
          { err: err instanceof Error ? err.message : String(err) },
          "error",
        );
        throw err;
      }
    });
  }) as unknown as T;

  return wrapped;
}
