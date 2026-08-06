import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import {
  requireAdmin,
  ok,
  badRequest,
  writeLog,
  clientMeta,
} from "@/lib/auth-guard";
import {
  ensureUserDir,
  resolveUserPath,
  toPosixRel,
  getStorageRoot,
} from "@/lib/storage";

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
  };
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const parentPath = toPosixRel(searchParams.get("path") || "");
  const download = searchParams.get("download");
  const fileId = searchParams.get("id");

  // Download a file by id
  if (download === "1" && fileId) {
    const row = await prisma.backupFile.findUnique({ where: { id: fileId } });
    if (!row || row.isDir) return badRequest("File not found");
    try {
      const abs = resolveUserPath(row.userId, row.path);
      if (!fs.existsSync(abs)) return badRequest("File missing on disk");
      const buf = fs.readFileSync(abs);
      return new Response(buf, {
        headers: {
          "Content-Type": row.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(row.name)}"`,
          "Content-Length": String(buf.length),
        },
      });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Read failed");
    }
  }

  if (!userId) {
    // List users that have storage / files
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        _count: { select: { backupFiles: true } },
      },
    });
    return ok({
      storageRoot: getStorageRoot(),
      users,
    });
  }

  ensureUserDir(userId);

  // Sync disk → db for this folder (lightweight)
  try {
    const absDir = resolveUserPath(userId, parentPath);
    if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const rel = toPosixRel(
          parentPath ? `${parentPath}/${ent.name}` : ent.name
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
    // listing still returns db rows
  }

  const files = await prisma.backupFile.findMany({
    where: { userId, parentPath },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
  });

  return ok({
    userId,
    path: parentPath,
    storageRoot: getStorageRoot(),
    files: files.map(serializeFile),
  });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  const contentType = request.headers.get("content-type") || "";

  // Multipart upload
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const userId = String(form.get("userId") || "");
    const parentPath = toPosixRel(String(form.get("path") || ""));
    const file = form.get("file");

    if (!userId) return badRequest("userId required");
    if (!(file instanceof File)) return badRequest("file required");

    ensureUserDir(userId);
    const name = file.name.replace(/[\\/]/g, "_");
    const rel = toPosixRel(parentPath ? `${parentPath}/${name}` : name);

    try {
      const abs = resolveUserPath(userId, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(abs, buf);

      const row = await prisma.backupFile.upsert({
        where: { userId_path: { userId, path: rel } },
        create: {
          userId,
          path: rel,
          name,
          parentPath,
          isDir: false,
          size: BigInt(buf.length),
          mimeType: file.type || guessMime(name),
        },
        update: {
          size: BigInt(buf.length),
          mimeType: file.type || guessMime(name),
        },
      });

      const meta = clientMeta(request);
      await writeLog({
        type: "FILE_CRUD",
        message: `Uploaded ${rel} for user ${userId}`,
        userId: session!.user.id,
        userEmail: session!.user.email,
        ...meta,
        metadata: { targetUserId: userId, path: rel, size: buf.length },
      });

      return ok({ file: serializeFile(row) }, { status: 201 });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Upload failed");
    }
  }

  // JSON: create folder or empty file
  let body: {
    userId?: string;
    path?: string;
    name?: string;
    isDir?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid body");
  }

  const userId = body.userId;
  const parentPath = toPosixRel(body.path || "");
  const name = body.name?.trim().replace(/[\\/]/g, "_");
  const isDir = body.isDir !== false;

  if (!userId || !name) return badRequest("userId and name required");

  const rel = toPosixRel(parentPath ? `${parentPath}/${name}` : name);
  ensureUserDir(userId);

  try {
    const abs = resolveUserPath(userId, rel);
    if (isDir) {
      fs.mkdirSync(abs, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, "");
    }

    const row = await prisma.backupFile.upsert({
      where: { userId_path: { userId, path: rel } },
      create: {
        userId,
        path: rel,
        name,
        parentPath,
        isDir,
        size: BigInt(0),
      },
      update: { isDir, name },
    });

    const meta = clientMeta(request);
    await writeLog({
      type: "FILE_CRUD",
      message: `Created ${isDir ? "folder" : "file"} ${rel} for ${userId}`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
      metadata: { targetUserId: userId, path: rel },
    });

    return ok({ file: serializeFile(row) }, { status: 201 });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Create failed");
  }
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  let body: { id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body.id || !body.name?.trim()) return badRequest("id and name required");

  const row = await prisma.backupFile.findUnique({ where: { id: body.id } });
  if (!row) return badRequest("Not found");

  const newName = body.name.trim().replace(/[\\/]/g, "_");
  const parent = row.parentPath;
  const newRel = toPosixRel(parent ? `${parent}/${newName}` : newName);

  try {
    const oldAbs = resolveUserPath(row.userId, row.path);
    const newAbs = resolveUserPath(row.userId, newRel);
    if (fs.existsSync(oldAbs)) {
      fs.renameSync(oldAbs, newAbs);
    }

    // Update this row + children if dir
    if (row.isDir) {
      const children = await prisma.backupFile.findMany({
        where: {
          userId: row.userId,
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
        const updatedParent =
          child.parentPath === row.path
            ? newRel
            : child.parentPath.startsWith(row.path + "/")
              ? toPosixRel(child.parentPath.replace(row.path, newRel))
              : child.parentPath === row.parentPath && child.id === row.id
                ? parent
                : child.parentPath;

        await prisma.backupFile.update({
          where: { id: child.id },
          data: {
            path: updatedPath,
            parentPath:
              child.id === row.id
                ? parent
                : updatedParent === child.parentPath &&
                    child.path.startsWith(row.path + "/")
                  ? toPosixRel(
                      path.posix.dirname(updatedPath) === "."
                        ? ""
                        : path.posix.dirname(updatedPath)
                    )
                  : child.parentPath === row.path
                    ? newRel
                    : child.parentPath.startsWith(row.path + "/")
                      ? toPosixRel(child.parentPath.replace(row.path, newRel))
                      : child.parentPath,
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

    const updated = await prisma.backupFile.findUnique({ where: { id: row.id } });
    const meta = clientMeta(request);
    await writeLog({
      type: "FILE_CRUD",
      message: `Renamed ${row.path} → ${newRel}`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
    });

    return ok({ file: updated ? serializeFile(updated) : null });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Rename failed");
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return badRequest("id required");

  const row = await prisma.backupFile.findUnique({ where: { id } });
  if (!row) return badRequest("Not found");

  try {
    const abs = resolveUserPath(row.userId, row.path);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }

    if (row.isDir) {
      await prisma.backupFile.deleteMany({
        where: {
          userId: row.userId,
          OR: [{ path: row.path }, { path: { startsWith: row.path + "/" } }],
        },
      });
    } else {
      await prisma.backupFile.delete({ where: { id } });
    }

    const meta = clientMeta(request);
    await writeLog({
      type: "FILE_CRUD",
      level: "WARN",
      message: `Deleted ${row.path} (user ${row.userId})`,
      userId: session!.user.id,
      userEmail: session!.user.email,
      ...meta,
    });

    return ok({ deleted: true, id });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Delete failed");
  }
}

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
