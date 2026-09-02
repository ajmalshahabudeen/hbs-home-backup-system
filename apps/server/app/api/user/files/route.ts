import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { decryptAtRestToBuffer } from "@/lib/at-rest";
import {
  badRequest,
  clientMeta,
  ok,
  requireSession,
  writeLog,
} from "@/lib/auth-guard";
import { resolveUploadTarget } from "@/lib/share-target";
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";
import {
  forgetTrashOriginal,
  originalPathForTrash,
  rememberTrashOriginal,
} from "@/lib/trash-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serializeFile(f: {
  id: string;
  userId: string;
  path: string;
  name: string;
  parentPath: string;
  isDir: boolean;
  mimeType: string | null;
  size: bigint;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...f,
    size: Number(f.size),
    canWrite: false as boolean | undefined,
  };
}

export const GET = withApiLog(
  "GET /api/user/files",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const parentPath = toPosixRel(searchParams.get("path") || "");
    const download = searchParams.get("download");
    const fileId = searchParams.get("id");
    const search = searchParams.get("search")?.trim();
    const category = searchParams.get("category"); // 'image', 'video', 'document', 'audio'

    // Download a file by id
    if (download === "1" && fileId) {
      let row = await prisma.backupFile.findFirst({
        where: { id: fileId, userId },
      });
      if (!row) {
        const shares = await prisma.folderShare.findMany({
          where: {
            OR: [
              { sharedWithUserId: userId },
              { sharedWithEmail: session.user.email.toLowerCase() },
            ],
          },
        });
        for (const share of shares) {
          const candidate = await prisma.backupFile.findFirst({
            where: {
              id: fileId,
              userId: share.ownerId,
              ...(share.path
                ? {
                    OR: [
                      { path: share.path },
                      { path: { startsWith: `${share.path}/` } },
                    ],
                  }
                : {}),
            },
          });
          if (candidate) {
            row = candidate;
            break;
          }
        }
      }
      if (!row || row.isDir) return badRequest("File not found");
      try {
        const abs = resolveUserPath(row.userId, row.path);
        if (!fs.existsSync(abs)) return badRequest("File missing on disk");
        const head = Buffer.alloc(4);
        const fd = fs.openSync(abs, "r");
        fs.readSync(fd, head, 0, 4, 0);
        fs.closeSync(fd);
        if (head.toString("utf8") === "HBS2") {
          const plain = await decryptAtRestToBuffer(abs);
          return new Response(new Uint8Array(plain), {
            headers: {
              "Content-Type": row.mimeType || "application/octet-stream",
              "Content-Disposition": `attachment; filename="${encodeURIComponent(row.name)}"`,
              "Content-Length": String(plain.length),
            },
          });
        }
        const stat = fs.statSync(abs);
        const stream = fs.createReadStream(abs);
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          headers: {
            "Content-Type": row.mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(row.name)}"`,
            "Content-Length": String(stat.size),
          },
        });
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : "Read failed");
      }
    }

    ensureUserDir(userId);

    if (!parentPath.startsWith("__share__/")) {
      // Sync disk -> db for current parentPath
      try {
        const absDir = resolveUserPath(userId, parentPath);
        if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
          const entries = fs.readdirSync(absDir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.name.startsWith(".")) continue;
            const rel = toPosixRel(
              parentPath ? `${parentPath}/${ent.name}` : ent.name,
            );
            const full = path.join(absDir, ent.name);
            const st = fs.statSync(full);
            await prisma.backupFile.upsert({
              where: { userId_path: { userId, path: rel } },
              create: {
                userId,
                path: rel,
                name: ent.name,
                parentPath,
                isDir: ent.isDirectory(),
                size: BigInt(ent.isDirectory() ? 0 : st.size),
                mimeType: ent.isDirectory() ? null : guessMime(ent.name),
              },
              update: {
                name: ent.name,
                isDir: ent.isDirectory(),
                size: BigInt(ent.isDirectory() ? 0 : st.size),
                mimeType: ent.isDirectory() ? null : guessMime(ent.name),
              },
            });
          }
        }
      } catch {
        // continue
      }
    }

    // Filter conditions
    const where: {
      userId: string;
      parentPath?: string;
      name?: { contains: string; mode: "insensitive" };
      searchName?: { contains: string };
      OR?: Array<Record<string, unknown>>;
      mimeType?: { startsWith: string } | { in: string[] };
      isDir?: boolean;
    } = { userId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { searchName: { contains: search.toLowerCase() } },
      ];
    } else if (!category || category === "all") {
      where.parentPath = parentPath;
    }

    if (category && category !== "all") {
      where.isDir = false;
      if (category === "image") {
        where.mimeType = { startsWith: "image/" };
      } else if (category === "video") {
        where.mimeType = { startsWith: "video/" };
      } else if (category === "audio") {
        where.mimeType = { startsWith: "audio/" };
      } else if (category === "document") {
        where.mimeType = {
          in: [
            "application/pdf",
            "text/plain",
            "application/json",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
        };
      }
    }

    const files = await prisma.backupFile.findMany({
      where: {
        ...where,
        NOT: [
          { name: { contains: ".hbs-thumb" } },
          { path: { contains: ".hbs-thumb" } },
        ],
      },
      orderBy: [{ isDir: "desc" }, { name: "asc" }],
    });

    const serialized = files.map(serializeFile);

    if (parentPath.startsWith("__share__/")) {
      const parts = parentPath.split("/");
      const shareId = parts[1] || "";
      const rest = parts.slice(2).join("/");
      const share = await prisma.folderShare.findFirst({
        where: {
          id: shareId,
          OR: [
            { sharedWithUserId: userId },
            { sharedWithEmail: session.user.email.toLowerCase() },
          ],
        },
      });
      if (!share) return badRequest("Share not found");
      const ownerParent = toPosixRel(
        share.path ? (rest ? `${share.path}/${rest}` : share.path) : rest,
      );
      const sharedFiles = await prisma.backupFile.findMany({
        where: {
          userId: share.ownerId,
          parentPath: ownerParent,
          NOT: [
            { name: { contains: ".hbs-thumb" } },
            { path: { contains: ".hbs-thumb" } },
          ],
        },
        orderBy: [{ isDir: "desc" }, { name: "asc" }],
      });
      return ok({
        userId,
        path: parentPath,
        currentPath: parentPath,
        files: sharedFiles.map((f) => ({
          ...serializeFile(f),
          path: `${parentPath}/${f.name}`,
          parentPath,
        })),
      });
    }

    if (!parentPath && !search) {
      const received = await prisma.folderShare.findMany({
        where: {
          OR: [
            { sharedWithUserId: userId },
            { sharedWithEmail: session.user.email.toLowerCase() },
          ],
        },
      });
      const owners = received.length
        ? await prisma.user.findMany({
            where: { id: { in: received.map((s) => s.ownerId) } },
            select: { id: true, email: true, name: true },
          })
        : [];
      const ownerMap = Object.fromEntries(owners.map((o) => [o.id, o]));
      for (const share of received) {
        const owner = ownerMap[share.ownerId];
        serialized.unshift({
          id: `share-${share.id}`,
          userId: share.ownerId,
          path: `__share__/${share.id}`,
          name: `Shared · ${owner?.name || owner?.email || "family"}`,
          parentPath: "",
          isDir: true,
          mimeType: null,
          size: 0,
          createdAt: share.createdAt,
          updatedAt: share.createdAt,
          canWrite: share.canWrite,
        });
      }
    }

    return ok({
      userId,
      path: parentPath,
      currentPath: parentPath,
      files: serialized,
    });
  },
);

export const POST = withApiLog(
  "POST /api/user/files",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    let body: {
      path?: string;
      parentPath?: string;
      name?: string;
      folderName?: string;
      isDir?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const incomingParent = toPosixRel(
      body.parentPath !== undefined ? (body.parentPath || "") : (body.path || ""),
    );
    const name = (body.folderName || body.name)?.trim().replace(/[\\/]/g, "_");
    const isDir = body.isDir !== false;

    if (!name) return badRequest("Name required");

    let ownerId = userId;
    let parentPath = incomingParent;
    try {
      const target = await resolveUploadTarget(
        { id: userId, email: session.user.email },
        incomingParent,
      );
      ownerId = target.ownerId;
      parentPath = target.parentPath;
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Cannot write here");
    }

    const rel = toPosixRel(parentPath ? `${parentPath}/${name}` : name);
    ensureUserDir(ownerId);

    try {
      const abs = resolveUserPath(ownerId, rel);
      if (isDir) {
        fs.mkdirSync(abs, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        if (!fs.existsSync(abs)) fs.writeFileSync(abs, "");
      }

      const row = await prisma.backupFile.upsert({
        where: { userId_path: { userId: ownerId, path: rel } },
        create: {
          userId: ownerId,
          path: rel,
          name,
          searchName: name.toLowerCase(),
          parentPath,
          isDir,
          size: BigInt(0),
        },
        update: { isDir, name, searchName: name.toLowerCase() },
      });

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User created ${isDir ? "folder" : "file"} ${rel}`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { path: rel, isDir },
      });
      console.log(
        `[HBS][FILE] create ${isDir ? "folder" : "file"} user=${session.user.email} path=${rel}`,
      );

      return ok({ file: serializeFile(row) }, { status: 201 });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Create failed");
    }
  },
);

export const PATCH = withApiLog(
  "PATCH /api/user/files",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    let body: {
      id?: string;
      name?: string;
      newName?: string;
      path?: string;
      restore?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (body.restore && body.id) {
      const row = await prisma.backupFile.findFirst({
        where: { id: body.id, userId },
      });
      if (!row) return badRequest("File not found");
      const original =
        originalPathForTrash(userId, row.path) || toPosixRel(row.name);
      const destParent = original.includes("/")
        ? original.slice(0, original.lastIndexOf("/"))
        : "";
      const destRel = original || row.name;
      try {
        const oldAbs = resolveUserPath(userId, row.path);
        const newAbs = resolveUserPath(userId, destRel);
        fs.mkdirSync(path.dirname(newAbs), { recursive: true });
        if (fs.existsSync(oldAbs)) fs.renameSync(oldAbs, newAbs);
        await prisma.backupFile.update({
          where: { id: row.id },
          data: {
            path: destRel,
            parentPath: destParent,
            name: path.posix.basename(destRel),
          },
        });
        forgetTrashOriginal(userId, row.path);
        return ok({ restored: true, path: destRel });
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : "Restore failed");
      }
    }

    const renameName = (body.name || body.newName || "").trim();
    if (!body.id && !body.path) return badRequest("id or path required");
    if (!renameName) return badRequest("name required");

    const row = await prisma.backupFile.findFirst({
      where: body.id
        ? { id: body.id, userId }
        : { path: toPosixRel(body.path || ""), userId },
    });
    if (!row) return badRequest("File not found");

    const newName = renameName.replace(/[\\/]/g, "_");
    const parent = row.parentPath;
    const newRel = toPosixRel(parent ? `${parent}/${newName}` : newName);

    try {
      const oldAbs = resolveUserPath(userId, row.path);
      const newAbs = resolveUserPath(userId, newRel);
      if (fs.existsSync(oldAbs)) {
        fs.renameSync(oldAbs, newAbs);
      }

      if (row.isDir) {
        const children = await prisma.backupFile.findMany({
          where: {
            userId,
            OR: [{ path: { startsWith: row.path + "/" } }, { path: row.path }],
          },
        });
        for (const child of children) {
          const updatedPath =
            child.path === row.path
              ? newRel
              : toPosixRel(child.path.replace(row.path, newRel));
          await prisma.backupFile.update({
            where: { id: child.id },
            data: {
              path: updatedPath,
              name: child.id === row.id ? newName : child.name,
            },
          });
        }
      } else {
        await prisma.backupFile.update({
          where: { id: row.id },
          data: { path: newRel, name: newName },
        });
      }

      const updated = await prisma.backupFile.findUnique({
        where: { id: row.id },
      });
      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User renamed ${row.path} → ${newRel}`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { from: row.path, to: newRel },
      });
      console.log(
        `[HBS][FILE] rename user=${session.user.email} ${row.path} -> ${newRel}`,
      );
      return ok({ file: updated ? serializeFile(updated) : null });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Rename failed");
    }
  },
);

export const DELETE = withApiLog(
  "DELETE /api/user/files",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) return error;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const emptyTrash = searchParams.get("emptyTrash") === "1";
    if (emptyTrash) {
      const rows = await prisma.backupFile.findMany({
        where: {
          userId,
          OR: [{ parentPath: "Trash" }, { path: { startsWith: "Trash/" } }],
        },
      });
      for (const row of rows) {
        const abs = resolveUserPath(userId, row.path);
        if (fs.existsSync(abs))
          fs.rmSync(abs, { recursive: true, force: true });
      }
      await prisma.backupFile.deleteMany({
        where: {
          userId,
          OR: [{ parentPath: "Trash" }, { path: { startsWith: "Trash/" } }],
        },
      });
      try {
        const trashAbs = resolveUserPath(userId, "Trash");
        if (fs.existsSync(trashAbs))
          fs.rmSync(trashAbs, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return ok({ emptied: true, count: rows.length });
    }
    const id = searchParams.get("id");
    const permanent = searchParams.get("permanent") === "1";
    if (!id) return badRequest("id required");

    const row = await prisma.backupFile.findFirst({
      where: { id, userId },
    });
    if (!row) return badRequest("File not found");

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
          await prisma.backupFile.delete({ where: { id } });
        }
        const meta = clientMeta(request);
        await writeLog({
          type: "USER_FILE_CRUD",
          message: `User permanently deleted ${row.isDir ? "folder" : "file"} ${row.path}`,
          userId,
          userEmail: session.user.email,
          ...meta,
          metadata: { path: row.path, isDir: row.isDir, permanent: true },
        });
        return ok({ deleted: true, id, permanent: true });
      }

      ensureUserDir(userId);
      const trashRel = toPosixRel(`Trash/${row.name}`);
      const trashAbs = resolveUserPath(userId, trashRel);
      fs.mkdirSync(path.dirname(trashAbs), { recursive: true });
      let destRel = trashRel;
      let destAbs = trashAbs;
      if (fs.existsSync(destAbs) || destRel === row.path) {
        destRel = toPosixRel(`Trash/${Date.now()}_${row.name}`);
        destAbs = resolveUserPath(userId, destRel);
      }
      if (fs.existsSync(abs)) {
        fs.renameSync(abs, destAbs);
      }
      rememberTrashOriginal(userId, destRel, row.path);
      if (row.isDir) {
        const children = await prisma.backupFile.findMany({
          where: {
            userId,
            OR: [{ path: { startsWith: row.path + "/" } }, { path: row.path }],
          },
        });
        for (const child of children) {
          const updatedPath =
            child.path === row.path
              ? destRel
              : toPosixRel(child.path.replace(row.path, destRel));
          await prisma.backupFile.update({
            where: { id: child.id },
            data: {
              path: updatedPath,
              parentPath:
                child.id === row.id
                  ? "Trash"
                  : child.parentPath.replace(row.path, destRel),
              name: child.id === row.id ? row.name : child.name,
            },
          });
        }
      } else {
        await prisma.backupFile.update({
          where: { id: row.id },
          data: { path: destRel, parentPath: "Trash", name: row.name },
        });
      }

      const meta = clientMeta(request);
      await writeLog({
        type: "USER_FILE_CRUD",
        message: `User moved ${row.isDir ? "folder" : "file"} ${row.path} to Trash`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: { path: row.path, trash: destRel, isDir: row.isDir },
      });
      console.log(
        `[HBS][FILE] trash user=${session.user.email} path=${row.path}`,
      );
      return ok({ deleted: false, trashed: true, id });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Delete failed");
    }
  },
);

function guessMime(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    zip: "application/zip",
  };
  return ext && map[ext] ? map[ext] : null;
}
