import { prisma } from "@workspace/db";
import { sendPushToUser } from "@/lib/push";
import { term } from "@/lib/term-log";

export async function notifyUser(userId: string, title: string, body: string) {
  term("INBOX", "notifyUser", { userId, title });
  try {
    await prisma.inboxEvent.create({ data: { userId, title, body } });
  } catch (err) {
    term("WARN", "inboxEvent create failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  await sendPushToUser(userId, title, body);
}

export async function notifyShareRecipients(
  ownerId: string,
  folderPath: string,
  message: string,
) {
  try {
    const shares = await prisma.folderShare.findMany({
      where: {
        ownerId,
        OR: [
          { path: "" },
          { path: folderPath },
          { path: { startsWith: folderPath ? `${folderPath}/` : "" } },
        ],
      },
    });
    for (const share of shares) {
      const uid = share.sharedWithUserId;
      if (!uid) {
        const user = await prisma.user.findFirst({
          where: { email: share.sharedWithEmail },
        });
        if (user) await notifyUser(user.id, "New shared file", message);
      } else {
        await notifyUser(uid, "New shared file", message);
      }
    }
    term("SHARE", "notifyShareRecipients", {
      ownerId,
      folderPath,
      shares: shares.length,
    });
  } catch (err) {
    term("WARN", "notifyShareRecipients failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
