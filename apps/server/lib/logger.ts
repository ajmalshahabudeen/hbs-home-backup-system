/**
 * App logger — always prints to terminal and persists to SystemLog when possible.
 */
import { writeLog } from "@/lib/auth-guard";

type Level = "INFO" | "WARN" | "ERROR";

export async function logAction(opts: {
  type: string;
  message: string;
  level?: Level;
  status?: "SUCCESS" | "FAILURE" | "WARNING";
  userId?: string | null;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}) {
  await writeLog({
    level: opts.level ?? "INFO",
    type: opts.type,
    status: opts.status ?? "SUCCESS",
    message: opts.message,
    userId: opts.userId,
    userEmail: opts.userEmail,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
    metadata: opts.metadata,
  });
}

export function logInfo(type: string, message: string, meta?: unknown) {
  return logAction({ type, message, level: "INFO", metadata: meta });
}

export function logWarn(type: string, message: string, meta?: unknown) {
  return logAction({
    type,
    message,
    level: "WARN",
    status: "WARNING",
    metadata: meta,
  });
}

export function logError(type: string, message: string, meta?: unknown) {
  return logAction({
    type,
    message,
    level: "ERROR",
    status: "FAILURE",
    metadata: meta,
  });
}
