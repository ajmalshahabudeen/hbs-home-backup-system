import { prisma } from "@workspace/db";
import { sendPushToUser } from "@/lib/push";

export async function notifyUser(userId: string, title: string, body: string) {
  try {
    await prisma.inboxEvent.create({ data: { userId, title, body } });
  } catch {
    /* table may not exist yet */
  }
  await sendPushToUser(userId, title, body);
}

export async function notifyShareRecipients(ownerId: string, folderPath: string, message: string) {
  try {
    const shares = await prisma.folderShare.findMany({
      where: {
        ownerId,
        OR: [{ path: "" }, { path: folderPath }, { path: { startsWith: folderPath ? `${folderPath}/` : "" } }],
      },
    });
    for (const share of shares) {
      const uid = share.sharedWithUserId;
      if (!uid) {
        const user = await prisma.user.findFirst({ where: { email: share.sharedWithEmail } });
        if (user) await notifyUser(user.id, "New shared file", message);
      } else {
        await notifyUser(uid, "New shared file", message);
      }
    }
  } catch {
    /* ignore */
  }
}
