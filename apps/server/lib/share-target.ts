import { prisma } from "@workspace/db";
import { toPosixRel } from "@/lib/storage";

export type UploadTarget = {
  ownerId: string;
  parentPath: string;
  shareId?: string;
};

export async function resolveUploadTarget(
  sessionUser: { id: string; email: string },
  parentPath: string,
): Promise<UploadTarget> {
  if (!parentPath.startsWith("__share__/")) {
    return { ownerId: sessionUser.id, parentPath };
  }
  const parts = parentPath.split("/");
  const shareId = parts[1] || "";
  const rest = parts.slice(2).join("/");
  const email = sessionUser.email.toLowerCase();
  const share = await prisma.folderShare.findFirst({
    where: {
      id: shareId,
      OR: [{ sharedWithUserId: sessionUser.id }, { sharedWithEmail: email }],
    },
  });
  if (!share) throw new Error("Share not found");
  if (!share.canWrite) throw new Error("This shared folder is read-only");
  const ownerParent = toPosixRel(share.path ? (rest ? `${share.path}/${rest}` : share.path) : rest);
  return { ownerId: share.ownerId, parentPath: ownerParent, shareId: share.id };
}
