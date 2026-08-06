import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@workspace/auth";
import { prisma } from "@workspace/db";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getSession(request?: NextRequest) {
  const h = request ? request.headers : await headers();
  return auth.api.getSession({ headers: h });
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
  try {
    await prisma.systemLog.create({
      data: {
        level: input.level ?? "INFO",
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
  } catch {
    // never throw from logging
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
