import { auth } from "@workspace/auth";
import { prisma } from "@workspace/db";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { term } from "@/lib/term-log";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/** Extract all candidate session tokens from Authorization Bearer, custom headers, Cookies, and query params. */
export function extractCandidateSessionTokens(
  request?: NextRequest,
  headerBag?: Headers,
): string[] {
  const h = headerBag || request?.headers;
  const rawValues: string[] = [];

  if (h) {
    // 1. Authorization header (Bearer ...)
    const authz = h.get("authorization") || h.get("Authorization");
    if (authz) {
      const match = authz.match(/^(?:Bearer\s+)+(.+)$/i);
      if (match?.[1]) {
        rawValues.push(match[1].trim());
      } else {
        rawValues.push(authz.trim());
      }
    }

    // 2. Custom header if provided
    const xToken =
      h.get("x-session-token") ||
      h.get("x-auth-token") ||
      h.get("x-better-auth-token");
    if (xToken) {
      rawValues.push(xToken.trim());
    }

    // 3. Cookie header
    const cookie = h.get("cookie") || "";
    if (cookie) {
      // Find all better-auth.session_token cookies or custom auth cookies
      const cookieMatches = cookie.matchAll(
        /(?:^|;\s*)(?:__Secure-)?(?:better-auth\.session_token|session_token|auth_token|token)=([^;]+)/gi,
      );
      for (const m of cookieMatches) {
        if (m[1]) {
          rawValues.push(m[1].trim());
        }
      }
      if (!cookie.includes("=") && cookie.length >= 10) {
        rawValues.push(cookie.trim());
      }
    }
  }

  if (request) {
    const q =
      request.nextUrl?.searchParams?.get("token") ||
      request.nextUrl?.searchParams?.get("sessionToken") ||
      request.nextUrl?.searchParams?.get("auth_token");
    if (q) rawValues.push(q.trim());
  }

  // Normalize and extract all valid candidates
  const candidates = new Set<string>();

  for (let val of rawValues) {
    if (!val) continue;

    // Handle quoted strings: "token" -> token
    val = val.replace(/^["']|["']$/g, "").trim();
    if (!val) continue;

    candidates.add(val);

    // Try URL decoding
    let decoded = val;
    try {
      decoded = decodeURIComponent(val);
      candidates.add(decoded);
    } catch {
      // ignore
    }

    // Strip nested cookie prefix: better-auth.session_token=...
    const rawPrefix = decoded.replace(
      /^(?:__Secure-)?(?:better-auth\.session_token=|session_token=|auth_token=|token=)+/i,
      "",
    );
    const strippedPrefix = (rawPrefix.split(";")[0] ?? "").trim();
    if (strippedPrefix) {
      candidates.add(strippedPrefix);

      // Strip signed cookie 's:' or 's%3A' prefix (Express / better-auth signed cookie convention)
      const withoutS = strippedPrefix.replace(/^s%3A|^s:/i, "").trim();
      candidates.add(withoutS);

      // If signed cookie (e.g. raw_token.signature), extract raw_token before the dot
      if (withoutS.includes(".")) {
        const dotParts = withoutS.split(".");
        const p0 = dotParts[0]?.trim();
        if (p0 && p0.length >= 5) {
          candidates.add(p0);
        }
      }
    }

    // Direct check for signed cookie in original decoded value
    if (decoded.includes(".")) {
      const parts = decoded.split(".");
      const p0 = parts[0]?.replace(/^s%3A|^s:/i, "").trim();
      if (p0 && p0.length >= 5) {
        candidates.add(p0);
      }
    }
  }

  return Array.from(candidates).filter((c) => c.length >= 5);
}

/** Extract primary session token (for backwards compatibility). */
export function extractSessionToken(
  request?: NextRequest,
  headerBag?: Headers,
): string | null {
  const candidates = extractCandidateSessionTokens(request, headerBag);
  return candidates[0] || null;
}

/**
 * Resolve session via Better Auth headers first, then fall back to direct
 * Session table lookup (needed for Expo uploadAsync / mobile Bearer tokens).
 */
export async function getSession(request?: NextRequest) {
  const h = request ? request.headers : await headers();
  term("AUTH", "→ getSession");

  try {
    const fromAuth = await auth.api.getSession({ headers: h });
    if (fromAuth?.user) {
      term("AUTH", "← getSession cookie/header ok", {
        user: fromAuth.user.email,
        id: fromAuth.user.id,
        via: "better-auth",
      });
      return fromAuth;
    }
  } catch (err) {
    term("AUTH", "better-auth getSession threw, trying token fallback", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const candidates = extractCandidateSessionTokens(
    request,
    request ? request.headers : h,
  );
  if (candidates.length === 0) {
    term("AUTH", "← getSession miss (no token candidates)");
    return null;
  }
  term("AUTH", "token fallback", { candidates: candidates.length });

  try {
    const row = await prisma.session.findFirst({
      where: {
        OR: [{ token: { in: candidates } }, { id: { in: candidates } }],
      },
      include: { user: true },
    });
    if (!row) {
      term("AUTH", "← getSession miss (no db row)");
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      term("AUTH", "← getSession expired", { user: row.user.email });
      return null;
    }
    if (row.user.banned) {
      term("AUTH", "← getSession banned", { user: row.user.email });
      return null;
    }
    term("AUTH", "← getSession token ok", {
      user: row.user.email,
      id: row.user.id,
      via: "prisma",
    });

    return {
      session: {
        id: row.id,
        userId: row.userId,
        token: row.token,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      },
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        emailVerified: row.user.emailVerified,
        image: row.user.image,
        createdAt: row.user.createdAt,
        updatedAt: row.user.updatedAt,
        role: row.user.role,
        banned: row.user.banned,
      },
    } as AppSession;
  } catch (err) {
    term("ERROR", "session db lookup error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function requireSession(request?: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    term("AUTH", "requireSession 401");
    return { session: null as null, error: unauthorized("Not authenticated") };
  }
  term("AUTH", "requireSession ok", {
    user: session.user.email,
    role: (session.user as { role?: string | null }).role,
  });
  return { session, error: null };
}

export async function requireAdmin(request?: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return { session: null as null, error };

  const role = (session!.user as { role?: string | null }).role;
  if (role !== "admin") {
    term("AUTH", "requireAdmin 403", { user: session!.user.email, role });
    return {
      session: null as null,
      error: forbidden("Admin access required"),
    };
  }

  if ((session!.user as { banned?: boolean | null }).banned) {
    term("AUTH", "requireAdmin banned", { user: session!.user.email });
    return {
      session: null as null,
      error: forbidden("Account is banned"),
    };
  }

  term("AUTH", "requireAdmin ok", { user: session!.user.email });
  return { session: session!, error: null };
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string, detail?: unknown) {
  return NextResponse.json({ error: message, detail }, { status: 400 });
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function writeLog(input: {
  level?: "INFO" | "WARN" | "ERROR";
  type: string;
  status?: "SUCCESS" | "FAILURE" | "WARNING";
  message: string;
  userId?: string | null;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}) {
  const level = input.level ?? "INFO";
  const tag =
    level === "ERROR" ? "ERROR" : level === "WARN" ? "WARN" : input.type;
  term(
    tag,
    input.message,
    input.metadata,
    level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info",
  );

  try {
    await prisma.systemLog.create({
      data: {
        level,
        type: input.type,
        status: input.status ?? "SUCCESS",
        message: input.message,
        userId: input.userId ?? undefined,
        userEmail: input.userEmail ?? undefined,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata:
          input.metadata === undefined
            ? undefined
            : JSON.stringify(input.metadata),
      },
    });
  } catch (e) {
    term("ERROR", "writeLog persist failed", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

export function clientMeta(request: NextRequest) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent"),
  };
}
