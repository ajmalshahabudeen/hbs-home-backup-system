import { prisma } from "@workspace/db";
import { toPosixRel } from "@/lib/storage";
import { term } from "@/lib/term-log";

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
    term(
      "SHARE",
      "upload target self",
      { ownerId: sessionUser.id, parentPath },
      "trace",
    );
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
  const ownerParent = toPosixRel(
    share.path ? (rest ? `${share.path}/${rest}` : share.path) : rest,
  );
  term("SHARE", "upload target share", {
    shareId: share.id,
    ownerId: share.ownerId,
    ownerParent,
  });
  return { ownerId: share.ownerId, parentPath: ownerParent, shareId: share.id };
}
