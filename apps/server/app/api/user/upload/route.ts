import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import type { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { encryptAtRestFile } from "@/lib/at-rest";
import {
  badRequest,
  clientMeta,
  ok,
  requireSession,
  writeLog,
} from "@/lib/auth-guard";
import { searchNameOf, snapshotVersion } from "@/lib/file-versions";
import { logAction } from "@/lib/logger";
import { assertQuota } from "@/lib/quota";
import { resolveUploadTarget } from "@/lib/share-target";
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiLog(
  "POST /api/user/upload",
  async (request: NextRequest) => {
    const { session, error } = await requireSession(request);
    if (error) {
      console.warn(
        "[HBS][UPLOAD] auth failed",
        request.headers.get("authorization") ? "has-bearer" : "no-bearer",
        request.headers.get("cookie") ? "has-cookie" : "no-cookie",
      );
      return error;
    }

    const userId = session.user.id;
    const contentType = request.headers.get("content-type") || "";
    const meta = clientMeta(request);

    console.log(
      `[HBS][UPLOAD] start user=${session.user.email} ct=${contentType.slice(0, 60)}`,
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
      let originalName = "";
      let onConflict = "rename";
      let mime: string | null = null;
      let fileBlob: File | Buffer | null = null;
      let rawCreationTime: string | null = request.headers.get(
        "x-file-creation-time",
      );

      try {
        const form = await request.formData();
        parentPath = toPosixRel(
          String(form.get("parentPath") || form.get("path") || ""),
        );
        const customName = String(
          form.get("fileName") ||
            form.get("name") ||
            form.get("filename") ||
            "",
        ).trim();
        originalName = String(
          form.get("originalName") || form.get("searchName") || customName,
        ).trim();
        onConflict = String(form.get("onConflict") || "rename").toLowerCase();
        const file = form.get("file");

        if (!rawCreationTime) {
          rawCreationTime =
            String(
              form.get("creationTime") ||
                form.get("capturedAt") ||
                form.get("mtime") ||
                "",
            ).trim() || null;
        }

        if (file instanceof File) {
          rawName = customName || file.name || `upload_${Date.now()}`;
          fileBlob = file;
          mime = file.type || guessMime(rawName);
        }
      } catch (formErr) {
        console.warn(
          "[HBS][UPLOAD] formData() failed, using multipart fallback",
          formErr instanceof Error ? formErr.message : formErr,
        );
        const fallback = await parseMultipartFallback(request, contentType);
        if (fallback) {
          parentPath = toPosixRel(fallback.parentPath);
          rawName = fallback.customName || fallback.fileName;
          fileBlob = fallback.fileBuf;
          mime = fallback.mimeType || guessMime(rawName);
          if (!rawCreationTime && fallback.creationTime) {
            rawCreationTime = fallback.creationTime;
          }
        }
      }

      if (!fileBlob || !rawName) {
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

      const target = await resolveUploadTarget(
        { id: userId, email: session.user.email },
        parentPath,
      );
      const ownerId = target.ownerId;
      parentPath = target.parentPath;

      ensureUserDir(ownerId);
      const name = rawName.replace(/[\\/]/g, "_");
      const incomingSize = Buffer.isBuffer(fileBlob)
        ? fileBlob.length
        : Number(fileBlob.size) || 0;
      await assertQuota(ownerId, incomingSize);
      const intendedRel = toPosixRel(
        parentPath ? `${parentPath}/${name}` : name,
      );

      let fileDate: Date | undefined;
      if (rawCreationTime) {
        const num = Number(rawCreationTime);
        if (!isNaN(num) && num > 0) {
          fileDate = new Date(num);
        } else {
          const d = new Date(rawCreationTime);
          if (!isNaN(d.getTime())) fileDate = d;
        }
      }

      const checkOnly =
        request.headers.get("x-check-only") === "1" ||
        new URL(request.url).searchParams.get("check") === "1";
      const existing = await prisma.backupFile.findUnique({
        where: { userId_path: { userId: ownerId, path: intendedRel } },
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

      if (
        existing &&
        onConflict === "ask" &&
        incomingSize > 0 &&
        Number(existing.size) !== incomingSize
      ) {
        return ok(
          {
            conflict: true,
            existing: { ...existing, size: Number(existing.size) },
            suggestedName: `${splitName(name).stem} (2)${splitName(name).ext}`,
          },
          { status: 409 },
        );
      }

      if (
        existing &&
        onConflict === "overwrite" &&
        Number(existing.size) !== incomingSize
      ) {
        await snapshotVersion({
          userId: ownerId,
          fileId: existing.id,
          name: existing.name,
          relPath: existing.path,
          size: Number(existing.size),
          mimeType: existing.mimeType,
        });
      }

      const rel =
        existing && onConflict === "overwrite"
          ? intendedRel
          : await uniqueUserRel(ownerId, parentPath, name, incomingSize);

      const abs = resolveUserPath(ownerId, rel);
      fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(abs), {
        recursive: true,
      });
      const bytes = await writeIncomingFile(abs, fileBlob);
      await encryptAtRestFile(abs);

      if (fileDate) {
        try {
          fs.utimesSync(abs, fileDate, fileDate);
        } catch {
          // ignore
        }
      }

      const rowData = {
        userId: ownerId,
        path: rel,
        name: path.posix.basename(rel),
        parentPath,
        isDir: false,
        size: BigInt(bytes),
        mimeType: mime,
        searchName: searchNameOf(originalName || name),
        ...(fileDate ? { createdAt: fileDate, updatedAt: fileDate } : {}),
      };

      const row = await prisma.backupFile.upsert({
        where: { userId_path: { userId: ownerId, path: rel } },
        create: rowData,
        update: {
          size: BigInt(bytes),
          mimeType: mime,
          searchName: searchNameOf(originalName || name),
          ...(fileDate ? { createdAt: fileDate, updatedAt: fileDate } : {}),
        },
      });

      await writeLog({
        type: "USER_UPLOAD",
        message: `User uploaded ${rel} (${bytes} bytes)`,
        userId,
        userEmail: session.user.email,
        ...meta,
        metadata: {
          path: rel,
          bytes,
          mime,
          creationTime: fileDate?.toISOString(),
        },
      });

      console.log(
        `[HBS][UPLOAD] ok user=${session.user.email} path=${rel} bytes=${bytes}`,
      );

      try {
        const { notifyShareRecipients } = await import("@/lib/inbox");
        await notifyShareRecipients(
          ownerId,
          parentPath,
          `${session.user.email} uploaded ${path.posix.basename(rel)}`,
        );
      } catch {
        /* ignore */
      }

      return ok(
        {
          file: {
            ...row,
            size: Number(row.size),
          },
        },
        { status: 201 },
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
  },
);

async function parseMultipartFallback(
  request: NextRequest,
  contentType: string,
): Promise<{
  fileBuf: Buffer;
  fileName: string;
  customName?: string;
  mimeType: string;
  parentPath: string;
  creationTime?: string;
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
    let creationTime = "";
    let fileBuf: Buffer | null = null;

    for (const part of parts) {
      if (!part || part === "--\r\n" || part === "--") continue;
      const headerEndIndex = part.indexOf("\r\n\r\n");
      if (headerEndIndex === -1) continue;

      const rawHeaders = part.slice(0, headerEndIndex);
      const rawBody = part.slice(headerEndIndex + 4, part.lastIndexOf("\r\n"));

      const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
      const fieldName = nameMatch && nameMatch[1] ? nameMatch[1] : "";

      if (fieldName === "parentPath" || fieldName === "path") {
        parentPath = rawBody.trim();
      } else if (
        fieldName === "fileName" ||
        fieldName === "name" ||
        fieldName === "filename"
      ) {
        customName = rawBody.trim();
      } else if (
        fieldName === "creationTime" ||
        fieldName === "capturedAt" ||
        fieldName === "mtime"
      ) {
        creationTime = rawBody.trim();
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
      return {
        fileBuf,
        fileName,
        customName,
        mimeType,
        parentPath,
        creationTime,
      };
    }
  } catch {
    // fallback failed
  }
  return null;
}

function splitName(name: string): { stem: string; ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, idx), ext: name.slice(idx) };
}

async function uniqueUserRel(
  userId: string,
  parentPath: string,
  name: string,
  incomingSize: number,
): Promise<string> {
  let candidate = toPosixRel(parentPath ? `${parentPath}/${name}` : name);
  const { stem, ext } = splitName(name);
  let n = 2;
  while (true) {
    const existing = await prisma.backupFile.findUnique({
      where: { userId_path: { userId, path: candidate } },
    });
    const abs = resolveUserPath(userId, candidate);
    const onDisk = fs.existsSync(/* turbopackIgnore: true */ abs);
    const existingSize = existing
      ? Number(existing.size)
      : onDisk
        ? fs.statSync(/* turbopackIgnore: true */ abs).size
        : null;
    if (existingSize == null) return candidate;
    if (incomingSize > 0 && existingSize === incomingSize) return candidate;
    const nextName = `${stem} (${n})${ext}`;
    candidate = toPosixRel(parentPath ? `${parentPath}/${nextName}` : nextName);
    n += 1;
    if (n > 500) return candidate;
  }
}

async function writeIncomingFile(
  abs: string,
  source: File | Buffer,
): Promise<number> {
  if (Buffer.isBuffer(source)) {
    await fs.promises.writeFile(/* turbopackIgnore: true */ abs, source);
    return source.length;
  }
  const writer = fs.createWriteStream(/* turbopackIgnore: true */ abs);
  const reader = source.stream().getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (!writer.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => writer.once("drain", resolve));
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on("error", reject);
    });
  }
  return bytes;
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
