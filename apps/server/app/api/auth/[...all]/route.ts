import { auth } from "@workspace/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { term } from "@/lib/term-log";

const rawHandler = toNextJsHandler(auth);

/**
 * Better Auth rejects POSTs with missing/null Origin (common for React Native,
 * Expo, native fetch, some proxies). Prefer the request's own Host (LAN IP)
 * so multi-client Wi‑Fi setups never get Invalid origin.
 */
function withTrustedOrigin(request: NextRequest): NextRequest {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && origin !== "null") {
    term("AUTH", "origin present", { origin }, "trace");
    return request;
  }

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;

  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "") ||
    "http";

  const fallback = (
    host
      ? `${proto}://${host}`
      : process.env.BETTER_AUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:38480"
  ).replace(/\/+$/, "");

  term("AUTH", "injected origin from host", { fallback, host });
  const headers = new Headers(request.headers);
  headers.set("origin", fallback);
  if (!referer || referer === "null") {
    headers.set("referer", `${fallback}/`);
  }
  // Help dynamic baseURL resolve the same host the client used
  if (host && !headers.get("host")) {
    headers.set("host", host);
  }

  return new NextRequest(request.url, {
    method: request.method,
    headers,
    body: request.body,
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
}

export const GET = withApiLog(
  "GET /api/auth/[...all]",
  async (request: NextRequest) => {
    return rawHandler.GET(withTrustedOrigin(request));
  },
);

export const POST = withApiLog(
  "POST /api/auth/[...all]",
  async (request: NextRequest) => {
    return rawHandler.POST(withTrustedOrigin(request));
  },
);
