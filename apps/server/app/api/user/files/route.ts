import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import {
  requireSession,
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
    const row = await prisma.backupFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!row || row.isDir) return badRequest("File not found");
    try {
      const abs = resolveUserPath(userId, row.path);
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

  ensureUserDir(userId);

  // Sync disk -> db for current parentPath
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
    // continue
  }

  // Filter conditions
  const where: {
    userId: string;
    parentPath?: string;
    name?: { contains: string; mode: "insensitive" };
    mimeType?: { startsWith: string } | { in: string[] };
    isDir?: boolean;
  } = { userId };

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
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
    where,
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
  });

  return ok({
    userId,
    path: parentPath,
    files: files.map(serializeFile),
  });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  let body: { path?: string; name?: string; isDir?: boolean };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parentPath = toPosixRel(body.path || "");
  const name = body.name?.trim().replace(/[\\/]/g, "_");
  const isDir = body.isDir !== false;

  if (!name) return badRequest("Name required");

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
      type: "USER_FILE_CRUD",
      message: `User created ${isDir ? "folder" : "file"} ${rel}`,
      userId,
      userEmail: session.user.email,
      ...meta,
    });

    return ok({ file: serializeFile(row) }, { status: 201 });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Create failed");
  }
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  let body: { id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.id || !body.name?.trim()) return badRequest("id and name required");

  const row = await prisma.backupFile.findFirst({
    where: { id: body.id, userId },
  });
  if (!row) return badRequest("File not found");

  const newName = body.name.trim().replace(/[\\/]/g, "_");
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

    const updated = await prisma.backupFile.findUnique({ where: { id: row.id } });
    return ok({ file: updated ? serializeFile(updated) : null });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Rename failed");
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return badRequest("id required");

  const row = await prisma.backupFile.findFirst({
    where: { id, userId },
  });
  if (!row) return badRequest("File not found");

  try {
    const abs = resolveUserPath(userId, row.path);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }

    if (row.isDir) {
      await prisma.backupFile.deleteMany({
        where: {
          userId,
          OR: [{ path: row.path }, { path: { startsWith: row.path + "/" } }],
        },
      });
    } else {
      await prisma.backupFile.delete({ where: { id } });
    }

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
