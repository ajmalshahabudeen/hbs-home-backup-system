import { auth } from "@workspace/auth";
import { prisma } from "@workspace/db";
import { hashPassword } from "better-auth/crypto";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import {
  badRequest,
  clientMeta,
  ok,
  requireAdmin,
  writeLog,
} from "@/lib/auth-guard";
import { ensureUserDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = withApiLog(
  "GET /api/admin/users",
  async (request: NextRequest) => {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        banReason: true,
        emailVerified: true,
        storageQuotaBytes: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { backupFiles: true, sessions: true },
        },
      },
    });

    return ok({ users });
  },
);

export const POST = withApiLog(
  "POST /api/admin/users",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    let body: {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const role = body.role === "admin" ? "admin" : "user";

    if (!name || !email || !password) {
      return badRequest("name, email, and password are required");
    }
    if (password.length < 8) {
      return badRequest("password must be at least 8 characters");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("Email already registered");

    // Prefer Better Auth admin API when available
    try {
      const created = await auth.api.createUser({
        body: {
          email,
          password,
          name,
          role,
        },
        headers: request.headers,
      });

      const userId =
        (created as { user?: { id?: string } })?.user?.id ||
        (created as { id?: string })?.id;

      if (userId) {
        ensureUserDir(userId);
      }

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_CRUD",
        message: `Admin created user ${email} (role=${role})`,
        userId: session!.user.id,
        userEmail: session!.user.email,
        ...meta,
        metadata: { targetEmail: email, role },
      });

      return ok({ user: created }, { status: 201 });
    } catch (e) {
      // Fallback: manual create if admin API shape differs
      const id = crypto.randomUUID();
      const hashed = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          id,
          name,
          email,
          role,
          emailVerified: true,
          accounts: {
            create: {
              id: crypto.randomUUID(),
              accountId: id,
              providerId: "credential",
              password: hashed,
            },
          },
        },
      });
      ensureUserDir(user.id);

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_CRUD",
        message: `Admin created user ${email} (role=${role}) [fallback]`,
        userId: session!.user.id,
        userEmail: session!.user.email,
        ...meta,
        metadata: {
          targetEmail: email,
          role,
          err: e instanceof Error ? e.message : String(e),
        },
      });

      return ok({ user }, { status: 201 });
    }
  },
);

export const PATCH = withApiLog(
  "PATCH /api/admin/users",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    let body: {
      id?: string;
      name?: string;
      role?: string;
      banned?: boolean;
      banReason?: string | null;
      storageQuotaBytes?: number | string | null;
    };
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.id) return badRequest("id is required");

    const data: {
      name?: string;
      role?: string;
      banned?: boolean;
      banReason?: string | null;
      banExpires?: Date | null;
      storageQuotaBytes?: bigint | null;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.role === "admin" || body.role === "user") {
      data.role = body.role;
    }
    if (typeof body.banned === "boolean") {
      data.banned = body.banned;
      data.banReason = body.banned
        ? (body.banReason ?? "Banned by admin")
        : null;
      data.banExpires = null;
    }
    if (body.storageQuotaBytes !== undefined) {
      const n = Number(body.storageQuotaBytes);
      data.storageQuotaBytes =
        Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) : null;
    }

    const user = await prisma.user.update({
      where: { id: body.id },
      data,
    });

    const meta = clientMeta(request);
    await writeLog({
      type: "USER_CRUD",
      message: `Admin updated user ${user.email}`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
      metadata: { targetId: user.id, data },
    });

    return ok({ user });
  },
);

export const DELETE = withApiLog(
  "DELETE /api/admin/users",
  async (request: NextRequest) => {
    const { session, error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return badRequest("id query param required");

    if (id === session!.user.id) {
      return badRequest("Cannot delete your own admin account");
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return badRequest("User not found");

    await prisma.user.delete({ where: { id } });

    const meta = clientMeta(request);
    await writeLog({
      type: "USER_CRUD",
      level: "WARN",
      message: `Admin deleted user ${user.email}`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
      metadata: { targetId: id, targetEmail: user.email },
    });

    return ok({ deleted: true, id });
  },
);
