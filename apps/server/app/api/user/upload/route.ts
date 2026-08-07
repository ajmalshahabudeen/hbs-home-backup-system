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
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) {
    console.warn(
      "[HBS][UPLOAD] auth failed",
      request.headers.get("authorization") ? "has-bearer" : "no-bearer",
      request.headers.get("cookie") ? "has-cookie" : "no-cookie"
    );
    return error;
  }

  const userId = session.user.id;
  const contentType = request.headers.get("content-type") || "";
  const meta = clientMeta(request);

  console.log(
    `[HBS][UPLOAD] start user=${session.user.email} ct=${contentType.slice(0, 60)}`
  );

  if (!contentType.includes("multipart/form-data")) {
    await logAction({
      type: "USER_UPLOAD",
      level: "WARN",
      status: "FAILURE",
      message: "Upload rejected: multipart/form-data required",
      userId,
      userEmail: session.user.email,
      ...meta,
    });
    return badRequest("multipart/form-data required");
  }

  try {
    let parentPath = "";
    let rawName = "";
    let mime: string | null = null;
    let buf: Buffer | null = null;

    try {
      const form = await request.formData();
      parentPath = toPosixRel(String(form.get("path") || ""));
      const customName = String(form.get("name") || form.get("filename") || "").trim();
      const file = form.get("file");

      if (file instanceof File) {
        rawName = customName || file.name || `upload_${Date.now()}`;
        buf = Buffer.from(await file.arrayBuffer());
        mime = file.type || guessMime(rawName);
      }
    } catch (formErr) {
      console.warn(
        "[HBS][UPLOAD] formData() failed, using multipart fallback",
        formErr instanceof Error ? formErr.message : formErr
      );
      const fallback = await parseMultipartFallback(request, contentType);
      if (fallback) {
        parentPath = toPosixRel(fallback.parentPath);
        rawName = fallback.customName || fallback.fileName;
        buf = fallback.fileBuf;
        mime = fallback.mimeType || guessMime(rawName);
      }
    }

    if (!buf || !rawName) {
      await logAction({
        type: "USER_UPLOAD",
        level: "WARN",
        status: "FAILURE",
        message: "Upload failed: file payload missing",
        userId,
        userEmail: session.user.email,
        ...meta,
      });
      return badRequest("file payload missing or unsupported format");
    }

    ensureUserDir(userId);
    const name = rawName.replace(/[\\/]/g, "_");
    const rel = toPosixRel(parentPath ? `${parentPath}/${name}` : name);

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
    fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(abs), {
      recursive: true,
    });
    fs.writeFileSync(/* turbopackIgnore: true */ abs, buf);

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

    await writeLog({
      type: "USER_UPLOAD",
      message: `User uploaded ${rel} (${buf.length} bytes)`,
      userId,
      userEmail: session.user.email,
      ...meta,
      metadata: { path: rel, bytes: buf.length, mime },
    });

    console.log(
      `[HBS][UPLOAD] ok user=${session.user.email} path=${rel} bytes=${buf.length}`
    );

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
    await logAction({
      type: "USER_UPLOAD",
      level: "ERROR",
      status: "FAILURE",
      message: `Upload error: ${e instanceof Error ? e.message : String(e)}`,
      userId,
      userEmail: session.user.email,
      ...meta,
    });
    return badRequest(e instanceof Error ? e.message : "Upload failed");
  }
}

async function parseMultipartFallback(
  request: NextRequest,
  contentType: string
): Promise<{
  fileBuf: Buffer;
  fileName: string;
  customName?: string;
  mimeType: string;
  parentPath: string;
} | null> {
  try {
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const boundaryMatch = contentType.match(/boundary=(?:["']?)([^"';\s]+)/i);
    if (!boundaryMatch) return null;
    const boundary = `--${boundaryMatch[1]}`;

    const parts = buffer.toString("binary").split(boundary);
    let fileName = "";
    let customName = "";
    let mimeType = "";
    let parentPath = "";
    let fileBuf: Buffer | null = null;

    for (const part of parts) {
      if (!part || part === "--\r\n" || part === "--") continue;
      const headerEndIndex = part.indexOf("\r\n\r\n");
      if (headerEndIndex === -1) continue;

      const rawHeaders = part.slice(0, headerEndIndex);
      const rawBody = part.slice(headerEndIndex + 4, part.lastIndexOf("\r\n"));

      const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
      const fieldName = nameMatch && nameMatch[1] ? nameMatch[1] : "";

      if (fieldName === "path") {
        parentPath = rawBody.trim();
      } else if (fieldName === "name" || fieldName === "filename") {
        customName = rawBody.trim();
      } else if (fieldName === "file" || rawHeaders.includes("filename=")) {
        const filenameMatch = rawHeaders.match(/filename="([^"]+)"/i);
        fileName =
          filenameMatch && filenameMatch[1]
            ? filenameMatch[1]
            : `upload_${Date.now()}`;
        const typeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
        mimeType = typeMatch && typeMatch[1] ? typeMatch[1].trim() : "";
        fileBuf = Buffer.from(rawBody, "binary");
      }
    }

    if (fileBuf && fileName) {
      return { fileBuf, fileName, customName, mimeType, parentPath };
    }
  } catch {
    // fallback failed
  }
  return null;
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
