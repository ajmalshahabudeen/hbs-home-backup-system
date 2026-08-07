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
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;

  const userId = session.user.id;
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    return badRequest("multipart/form-data required");
  }

  try {
    const form = await request.formData();
    const parentPath = toPosixRel(String(form.get("path") || ""));
    const file = form.get("file");

    if (!(file instanceof File)) {
      return badRequest("file payload missing");
    }

    ensureUserDir(userId);
    const rawName = file.name || `upload_${Date.now()}`;
    const name = rawName.replace(/[\\/]/g, "_");
    const rel = toPosixRel(parentPath ? `${parentPath}/${name}` : name);

    // Preflight deduplication check
    const checkOnly =
      request.headers.get("x-check-only") === "1" ||
      new URL(request.url).searchParams.get("check") === "1";
    const existing = await prisma.backupFile.findUnique({
      where: { userId_path: { userId, path: rel } },
    });

    if (checkOnly && existing) {
      return ok({
        duplicate: true,
        file: {
          ...existing,
          size: Number(existing.size),
        },
      });
    }

    const abs = resolveUserPath(userId, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(abs, buf);

    const mime = file.type || guessMime(name);

    const row = await prisma.backupFile.upsert({
      where: { userId_path: { userId, path: rel } },
      create: {
        userId,
        path: rel,
        name,
        parentPath,
        isDir: false,
        size: BigInt(buf.length),
        mimeType: mime,
      },
      update: {
        size: BigInt(buf.length),
        mimeType: mime,
      },
    });

    const meta = clientMeta(request);
    await writeLog({
      type: "USER_UPLOAD",
      message: `User uploaded ${rel} (${buf.length} bytes)`,
      userId,
      userEmail: session.user.email,
      ...meta,
    });

    return ok(
      {
        file: {
          ...row,
          size: Number(row.size),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Upload failed");
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
