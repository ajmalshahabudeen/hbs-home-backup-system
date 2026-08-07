import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@workspace/auth";
import { prisma } from "@workspace/db";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/** Extract session token from Authorization Bearer, Cookie, or ?token= query. */
export function extractSessionToken(
  request?: NextRequest,
  headerBag?: Headers
): string | null {
  const h = headerBag || request?.headers;
  if (!h) return null;

  const authz = h.get("authorization") || h.get("Authorization");
  if (authz) {
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }

  const cookie = h.get("cookie") || "";
  // better-auth may use better-auth.session_token or __Secure-...
  const cookieMatch = cookie.match(
    /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/i
  );
  if (cookieMatch?.[1]) {
    try {
      return decodeURIComponent(cookieMatch[1]);
    } catch {
      return cookieMatch[1];
    }
  }

  if (request) {
    const q = request.nextUrl?.searchParams?.get("token");
    if (q) return q.trim();
  }

  return null;
}

/**
 * Resolve session via Better Auth headers first, then fall back to direct
 * Session table lookup (needed for Expo uploadAsync / mobile Bearer tokens).
 */
export async function getSession(request?: NextRequest) {
  const h = request ? request.headers : await headers();

  try {
    const fromAuth = await auth.api.getSession({ headers: h });
    if (fromAuth?.user) return fromAuth;
  } catch {
    // continue to token fallback
  }

  const token = extractSessionToken(
    request,
    request ? request.headers : h
  );
  if (!token) return null;

  try {
    const row = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    if (row.user.banned) return null;

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
  } catch {
    return null;
  }
}

export async function requireSession(request?: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return { session: null as null, error: unauthorized("Not authenticated") };
  }
  return { session, error: null };
}

export async function requireAdmin(request?: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return { session: null as null, error };

  const role = (session!.user as { role?: string | null }).role;
  if (role !== "admin") {
    return {
      session: null as null,
      error: forbidden("Admin access required"),
    };
  }

  if ((session!.user as { banned?: boolean | null }).banned) {
    return {
      session: null as null,
      error: forbidden("Account is banned"),
    };
  }

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
  const line = `[HBS][${level}][${input.type}] ${input.message}`;
  if (level === "ERROR") console.error(line, input.metadata ?? "");
  else if (level === "WARN") console.warn(line, input.metadata ?? "");
  else console.log(line, input.metadata ?? "");

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
    console.error("[HBS] writeLog failed", e);
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
