import crypto from "node:crypto";
import { prisma } from "@workspace/db";
import { getRedis } from "@/lib/redis";

export type EnqueueResult = {
  ok: boolean;
  jobId?: string;
  taskId?: string;
  type?: string;
  error?: string;
  queueBackend?: string;
};

export type EnqueueOptions = {
  type: string;
  userId?: string;
  fix?: boolean;
  workers?: number;
  limit?: number;
  payload?: Record<string, unknown>;
};

const TASK_MAP: Record<
  string,
  { taskName: string; queue: string; createsJob: boolean }
> = {
  SCAN: {
    taskName: "worker.tasks.run_scan",
    queue: "scans",
    createsJob: true,
  },
  CONSISTENCY: {
    taskName: "worker.tasks.run_consistency",
    queue: "scans",
    createsJob: true,
  },
  CHECKSUM: {
    taskName: "worker.tasks.run_checksums",
    queue: "heavy",
    createsJob: true,
  },
  CRON_CONSISTENCY_ALL: {
    taskName: "worker.tasks.run_cron_consistency_all",
    queue: "cron",
    createsJob: false,
  },
  REQUEUE_STALE: {
    taskName: "worker.tasks.run_requeue_stale",
    queue: "cron",
    createsJob: false,
  },
  WARM_STATS: {
    taskName: "worker.tasks.warm_stats_cache",
    queue: "cron",
    createsJob: false,
  },
};

function parseArgs(args: string[]): EnqueueOptions {
  let type = "";
  let userId: string | undefined;
  let fix: boolean | undefined;
  let workers: number | undefined;
  let limit: number | undefined;
  let payload: Record<string, unknown> | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--type" && i + 1 < args.length) {
      type = args[++i]!;
    } else if (a === "--user-id" && i + 1 < args.length) {
      userId = args[++i];
    } else if (a === "--fix" && i + 1 < args.length) {
      const v = args[++i]!.toLowerCase();
      fix = v === "1" || v === "true" || v === "yes";
    } else if (a === "--workers" && i + 1 < args.length) {
      workers = Number(args[++i]) || undefined;
    } else if (a === "--limit" && i + 1 < args.length) {
      limit = Number(args[++i]) || undefined;
    } else if (a === "--payload" && i + 1 < args.length) {
      try {
        payload = JSON.parse(args[++i]!);
      } catch {
        // ignore invalid json
      }
    }
  }

  return { type, userId, fix, workers, limit, payload };
}

/**
 * Publish a Celery v2 protocol task message directly to Redis.
 */
async function publishCeleryTask(
  taskName: string,
  queue: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<{ ok: boolean; taskId: string; error?: string }> {
  const redis = getRedis();
  if (!redis) {
    return { ok: false, taskId: "", error: "Redis is not connected (REDIS_URL not configured)" };
  }

  const taskId = crypto.randomUUID();
  const bodyArray = [
    args,
    kwargs,
    { callbacks: null, errbacks: null, chain: null, chord: null },
  ];
  const bodyBase64 = Buffer.from(JSON.stringify(bodyArray)).toString("base64");

  const message = {
    body: bodyBase64,
    "content-encoding": "utf-8",
    "content-type": "application/json",
    headers: {
      lang: "js",
      task: taskName,
      id: taskId,
      shadow: null,
      eta: null,
      expires: null,
      group: null,
      group_index: null,
      retries: 0,
      timelimit: [null, null],
      root_id: taskId,
      parent_id: null,
      argsrepr: JSON.stringify(args),
      kwargsrepr: JSON.stringify(kwargs),
      origin: "hbs-server",
    },
    properties: {
      correlation_id: taskId,
      reply_to: taskId,
      delivery_mode: 2,
      delivery_info: {
        exchange: "",
        routing_key: queue,
      },
      priority: 0,
      body_encoding: "base64",
      delivery_tag: taskId,
    },
  };

  try {
    await redis.lpush(queue, JSON.stringify(message));
    return { ok: true, taskId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[HBS][QUEUE] Redis LPUSH failed:", errorMsg);
    return { ok: false, taskId, error: errorMsg };
  }
}

/**
 * Enqueue a background job into PostgreSQL and dispatch Celery task via Redis.
 */
export async function enqueueJob(
  input: string[] | EnqueueOptions,
  _timeoutMs = 20_000
): Promise<EnqueueResult> {
  const backend = process.env.QUEUE_BACKEND || "celery";
  if (backend === "inline") {
    return {
      ok: false,
      error: "inline backend not implemented — set QUEUE_BACKEND=celery",
    };
  }

  const opts = Array.isArray(input) ? parseArgs(input) : input;
  const t = (opts.type || "").toUpperCase();

  const taskDef = TASK_MAP[t];
  if (!taskDef) {
    return { ok: false, error: `unknown job type ${t}` };
  }

  // Fire-and-forget cron tasks
  if (!taskDef.createsJob) {
    const dispatch = await publishCeleryTask(taskDef.taskName, taskDef.queue, [], {});
    if (!dispatch.ok) {
      return { ok: false, type: t, error: dispatch.error || "Failed to publish task to Redis" };
    }
    return {
      ok: true,
      type: t,
      taskId: dispatch.taskId,
      queueBackend: "celery",
    };
  }

  // User-scoped tasks (SCAN, CONSISTENCY, CHECKSUM)
  if (!opts.userId) {
    return { ok: false, error: "userId required for job" };
  }

  const payload = {
    userId: opts.userId,
    fix: opts.fix !== false,
    workers: opts.workers ?? null,
    limit: opts.limit ?? 500,
    ...(opts.payload || {}),
  };

  try {
    // 1. Create job row in Postgres via Prisma
    const job = await prisma.backgroundJob.create({
      data: {
        type: t,
        status: "PENDING",
        progress: 0,
        payload: JSON.stringify(payload),
        userId: opts.userId,
      },
    });

    // 2. Publish Celery task with job.id as argument
    const dispatch = await publishCeleryTask(
      taskDef.taskName,
      taskDef.queue,
      [job.id],
      {}
    );

    if (!dispatch.ok) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: dispatch.error || "Failed to push task to Redis queue",
        },
      });
      return {
        ok: false,
        jobId: job.id,
        error: dispatch.error || "Failed to push task to Redis",
      };
    }

    // 3. Update job row with Celery task ID
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        celeryTaskId: dispatch.taskId,
      },
    });

    return {
      ok: true,
      jobId: job.id,
      taskId: dispatch.taskId,
      type: t,
      queueBackend: "celery",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[HBS][QUEUE] enqueueJob error:", errorMsg);
    return { ok: false, error: errorMsg };
  }
}
