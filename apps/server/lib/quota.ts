import { prisma } from "@workspace/db";
import { term } from "@/lib/term-log";

export async function usedBytesForUser(userId: string): Promise<number> {
  const used = await prisma.backupFile.aggregate({
    where: { userId, isDir: false },
    _sum: { size: true },
  });
  const n = Number(used._sum.size ?? 0);
  term("QUOTA", "usedBytesForUser", { userId, used: n }, "trace");
  return n;
}

export async function assertQuota(
  userId: string,
  extraBytes: number,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storageQuotaBytes: true },
  });
  if (!user?.storageQuotaBytes) return;
  const used = await usedBytesForUser(userId);
  if (used + Math.max(0, extraBytes) > Number(user.storageQuotaBytes)) {
    term("QUOTA", "quota exceeded", {
      userId,
      used,
      extraBytes,
      quota: Number(user.storageQuotaBytes),
    });
    throw new Error("Storage quota exceeded");
  }
  term(
    "QUOTA",
    "quota ok",
    { userId, used, extraBytes, quota: Number(user.storageQuotaBytes) },
    "trace",
  );
}
