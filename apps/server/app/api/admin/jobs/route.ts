import { NextRequest } from "next/server";
import { prisma } from "@workspace/db";
import {
  requireAdmin,
  ok,
  badRequest,
  writeLog,
  clientMeta,
} from "@/lib/auth-guard";
import { enqueueJob } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const status = searchParams.get("status") || undefined;
  const type = searchParams.get("type") || undefined;

  const jobs = await prisma.backgroundJob.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return ok({ jobs });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  let body: {
    type?: string;
    userId?: string;
    fix?: boolean;
    workers?: number;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const type = (body.type || "").toUpperCase();
  if (!type) return badRequest("type required");

  const args: string[] = ["--type", type];
  if (body.userId) {
    args.push("--user-id", body.userId);
  }
  if (typeof body.fix === "boolean") {
    args.push("--fix", body.fix ? "true" : "false");
  }
  if (body.workers) args.push("--workers", String(body.workers));
  if (body.limit) args.push("--limit", String(body.limit));

  const result = await enqueueJob(args);
  const meta = clientMeta(request);
  await writeLog({
    type: "JOB",
    message: `Enqueued ${type} job`,
    userId: session!.user.id,
    userEmail: session!.user.email,
    status: result.ok ? "SUCCESS" : "FAILURE",
    level: result.ok ? "INFO" : "ERROR",
    ...meta,
    metadata: result,
  });

  if (!result.ok) {
    return badRequest(result.error || "enqueue failed", result);
  }
  return ok(result, { status: 201 });
}
