import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import {
  badRequest,
  clientMeta,
  ok,
  requireSession,
  writeLog,
} from "@/lib/auth-guard";
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";
import { rememberTrashOriginal } from "@/lib/trash-meta";
import { broadcastDriveChange } from "@/lib/ws-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getUniqueName(
  baseName: string,
  existingNames: Set<string>,
  isDir: boolean,
): string {
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  let nameWithoutExt = baseName;
  let ext = "";
  if (!isDir && baseName.includes(".")) {
    const lastDot = baseName.lastIndexOf(".");
    nameWithoutExt = baseName.substring(0, lastDot);
    ext = baseName.substring(lastDot);
  }

  let counter = 1;
  let candidate = `${nameWithoutExt} (Copy)${ext}`;
  while (existingNames.has(candidate.toLowerCase())) {
    counter++;
    candidate = `${nameWithoutExt} (Copy ${counter})${ext}`;
  }
  return candidate;
}

export const POST = withApiLog(
  "POST /api/user/files/batch",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    let body: {
      action: "move" | "copy" | "delete";
      fileIds: string[];
      destinationPath?: string;
      permanent?: boolean;
    };

    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const { action, fileIds, destinationPath = "", permanent = false } = body;
    if (
      !action ||
      !fileIds ||
      !Array.isArray(fileIds) ||
      fileIds.length === 0
    ) {
      return badRequest("action and fileIds array are required");
    }

    // Fetch all requested files owned by this user
    const sourceFiles = await prisma.backupFile.findMany({
      where: { id: { in: fileIds }, userId },
    });

    if (sourceFiles.length === 0) {
      return badRequest("No valid files found");
    }

    ensureUserDir(userId);
    const destParent = toPosixRel(destinationPath || "");

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DELETE ACTION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "delete") {
      const deletedIds: string[] = [];
      for (const row of sourceFiles) {
        try {
          const abs = resolveUserPath(userId, row.path);
          const inTrash =
            row.parentPath === "Trash" || row.path.startsWith("Trash/");

          if (permanent || inTrash) {
            if (fs.existsSync(abs)) {
              fs.rmSync(abs, { recursive: true, force: true });
            }
            if (row.isDir) {
              await prisma.backupFile.deleteMany({
                where: {
                  userId,
                  OR: [
                    { path: row.path },
                    { path: { startsWith: row.path + "/" } },
                  ],
                },
              });
            } else {
              await prisma.backupFile.delete({ where: { id: row.id } });
            }
          } else {
            // Soft delete: move to Trash
            const trashRel = toPosixRel(`Trash/${row.name}`);
            const trashAbs = resolveUserPath(userId, trashRel);
            fs.mkdirSync(path.dirname(trashAbs), { recursive: true });
            let destRel = trashRel;
            let finalAbs = trashAbs;
            if (fs.existsSync(finalAbs) || destRel === row.path) {
              destRel = toPosixRel(`Trash/${Date.now()}_${row.name}`);
              finalAbs = resolveUserPath(userId, destRel);
            }
            if (fs.existsSync(abs)) {
              fs.renameSync(abs, finalAbs);
            }
            rememberTrashOriginal(userId, destRel, row.path);

            if (row.isDir) {
              const children = await prisma.backupFile.findMany({
                where: {
                  userId,
                  OR: [
                    { path: { startsWith: row.path + "/" } },
                    { path: row.path },
                  ],
                },
              });
              for (const child of children) {
                const updatedPath =
                  child.path === row.path
                    ? destRel
                    : toPosixRel(child.path.replace(row.path, destRel));
                const updatedParent = updatedPath.includes("/")
                  ? updatedPath.slice(0, updatedPath.lastIndexOf("/"))
                  : "";
                await prisma.backupFile.update({
                  where: { id: child.id },
                  data: { path: updatedPath, parentPath: updatedParent },
                });
              }
            } else {
              await prisma.backupFile.update({
                where: { id: row.id },
                data: {
                  path: destRel,
                  parentPath: "Trash",
                  name: path.posix.basename(destRel),
                },
              });
            }
          }
          deletedIds.push(row.id);
        } catch (e) {
          console.error(`[HBS][BATCH] Error deleting ${row.path}:`, e);
        }
      }

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User batch deleted ${deletedIds.length} items (permanent=${permanent})`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { deletedCount: deletedIds.length, permanent },
      });

      broadcastDriveChange({
        userId,
        action: "delete",
        path: destParent,
        meta: { deletedCount: deletedIds.length, permanent },
      });

      return ok({ success: true, count: deletedIds.length, ids: deletedIds });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. MOVE ACTION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "move") {
      // Validate destination folder exists (if not root)
      if (destParent) {
        const destFolder = await prisma.backupFile.findFirst({
          where: { userId, path: destParent, isDir: true },
        });
        if (!destFolder) {
          return badRequest("Destination folder does not exist");
        }
      }

      // Pre-check for Rule 2: ensure no folder is moved into itself or its own subdirectories
      for (const row of sourceFiles) {
        if (row.isDir) {
          if (
            destParent === row.path ||
            destParent.startsWith(row.path + "/")
          ) {
            return badRequest(
              `Cannot move folder "${row.name}" into itself or any of its subdirectories.`,
            );
          }
        }
      }

      // Existing names in destination
      const existingInDest = await prisma.backupFile.findMany({
        where: { userId, parentPath: destParent },
        select: { name: true },
      });
      const existingNameSet = new Set(
        existingInDest.map((f) => f.name.toLowerCase()),
      );

      const movedIds: string[] = [];

      for (const row of sourceFiles) {
        if (row.parentPath === destParent) {
          // Already in destination
          movedIds.push(row.id);
          continue;
        }

        try {
          const oldAbs = resolveUserPath(userId, row.path);
          const targetName = getUniqueName(
            row.name,
            existingNameSet,
            row.isDir,
          );
          existingNameSet.add(targetName.toLowerCase());

          const newRel = toPosixRel(
            destParent ? `${destParent}/${targetName}` : targetName,
          );
          const newAbs = resolveUserPath(userId, newRel);

          fs.mkdirSync(path.dirname(newAbs), { recursive: true });
          if (fs.existsSync(oldAbs)) {
            fs.renameSync(oldAbs, newAbs);
          }

          if (row.isDir) {
            const children = await prisma.backupFile.findMany({
              where: {
                userId,
                OR: [
                  { path: { startsWith: row.path + "/" } },
                  { path: row.path },
                ],
              },
            });
            for (const child of children) {
              const updatedPath =
                child.path === row.path
                  ? newRel
                  : toPosixRel(child.path.replace(row.path, newRel));
              const updatedParent = updatedPath.includes("/")
                ? updatedPath.slice(0, updatedPath.lastIndexOf("/"))
                : "";
              await prisma.backupFile.update({
                where: { id: child.id },
                data: {
                  path: updatedPath,
                  parentPath: updatedParent,
                  name: child.id === row.id ? targetName : child.name,
                },
              });
            }
          } else {
            await prisma.backupFile.update({
              where: { id: row.id },
              data: {
                path: newRel,
                parentPath: destParent,
                name: targetName,
                searchName: targetName.toLowerCase(),
              },
            });
          }
          movedIds.push(row.id);
        } catch (e) {
          console.error(`[HBS][BATCH] Error moving ${row.path}:`, e);
        }
      }

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User batch moved ${movedIds.length} items to "${destParent || "root"}"`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { destination: destParent, count: movedIds.length },
      });

      broadcastDriveChange({
        userId,
        action: "batch",
        path: destParent,
        meta: { movedCount: movedIds.length, action: "move" },
      });

      return ok({ success: true, count: movedIds.length, ids: movedIds });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. COPY ACTION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "copy") {
      // Validate destination folder exists (if not root)
      if (destParent) {
        const destFolder = await prisma.backupFile.findFirst({
          where: { userId, path: destParent, isDir: true },
        });
        if (!destFolder) {
          return badRequest("Destination folder does not exist");
        }
      }

      // Pre-check for Rule 2: ensure no folder is copied into itself or its own subdirectories
      for (const row of sourceFiles) {
        if (row.isDir) {
          if (
            destParent === row.path ||
            destParent.startsWith(row.path + "/")
          ) {
            return badRequest(
              `Cannot copy folder "${row.name}" into itself or any of its subdirectories.`,
            );
          }
        }
      }

      // Existing names in destination
      const existingInDest = await prisma.backupFile.findMany({
        where: { userId, parentPath: destParent },
        select: { name: true },
      });
      const existingNameSet = new Set(
        existingInDest.map((f) => f.name.toLowerCase()),
      );

      const copiedItems: string[] = [];

      for (const row of sourceFiles) {
        try {
          const oldAbs = resolveUserPath(userId, row.path);
          const targetName = getUniqueName(
            row.name,
            existingNameSet,
            row.isDir,
          );
          existingNameSet.add(targetName.toLowerCase());

          const newRel = toPosixRel(
            destParent ? `${destParent}/${targetName}` : targetName,
          );
          const newAbs = resolveUserPath(userId, newRel);

          fs.mkdirSync(path.dirname(newAbs), { recursive: true });

          if (row.isDir) {
            // Copy directory on disk
            if (fs.existsSync(oldAbs)) {
              fs.cpSync(oldAbs, newAbs, { recursive: true });
            }

            // Create target directory in DB
            await prisma.backupFile.create({
              data: {
                userId,
                path: newRel,
                name: targetName,
                searchName: targetName.toLowerCase(),
                parentPath: destParent,
                isDir: true,
                size: row.size,
                mimeType: null,
              },
            });

            // Find all descendants and clone them in DB
            const children = await prisma.backupFile.findMany({
              where: {
                userId,
                path: { startsWith: row.path + "/" },
              },
            });

            for (const child of children) {
              const childRel = toPosixRel(child.path.replace(row.path, newRel));
              const childParent = childRel.includes("/")
                ? childRel.slice(0, childRel.lastIndexOf("/"))
                : "";
              await prisma.backupFile.create({
                data: {
                  userId,
                  path: childRel,
                  name: child.name,
                  searchName: child.searchName,
                  parentPath: childParent,
                  isDir: child.isDir,
                  size: child.size,
                  mimeType: child.mimeType,
                },
              });
            }
          } else {
            // Copy single file on disk
            if (fs.existsSync(oldAbs)) {
              fs.copyFileSync(oldAbs, newAbs);
            }

            // Create cloned record in DB
            await prisma.backupFile.create({
              data: {
                userId,
                path: newRel,
                name: targetName,
                searchName: targetName.toLowerCase(),
                parentPath: destParent,
                isDir: false,
                size: row.size,
                mimeType: row.mimeType,
              },
            });
          }

          copiedItems.push(row.id);
        } catch (e) {
          console.error(`[HBS][BATCH] Error copying ${row.path}:`, e);
        }
      }

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User batch copied ${copiedItems.length} items to "${destParent || "root"}"`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { destination: destParent, count: copiedItems.length },
      });

      broadcastDriveChange({
        userId,
        action: "batch",
        path: destParent,
        meta: { copiedCount: copiedItems.length, action: "copy" },
      });

      return ok({ success: true, count: copiedItems.length });
    }

    return badRequest(`Unsupported action: ${action}`);
  },
);
