import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest, writeLog, clientMeta } from "@/lib/auth-guard";
import { ensureUserDir, resolveUserPath, toPosixRel } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function chunkDir(userId: string, uploadId: string) {
  return path.join(os.tmpdir(), "hbs-chunks", userId, uploadId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

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
    const uploadId = String(form.get("uploadId") || "").trim();
    const index = Number(form.get("index") ?? form.get("chunkIndex") ?? -1);
    const total = Number(form.get("total") ?? form.get("totalChunks") ?? 0);
    const fileName = String(form.get("fileName") || form.get("name") || "").replace(/[\\/]/g, "_");
    const parentPath = toPosixRel(String(form.get("parentPath") || form.get("path") || ""));
    const mime = String(form.get("mimeType") || "") || null;
    const file = form.get("chunk") ?? form.get("file");

    if (!uploadId || !fileName || index < 0 || total < 1 || !(file instanceof File)) {
      return badRequest("uploadId, index, total, fileName, chunk required");
    }

    const dir = chunkDir(userId, uploadId);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    const partAbs = path.join(dir, String(index).padStart(6, "0"));
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(/* turbopackIgnore: true */ partAbs, buf);

    const parts = fs
      .readdirSync(/* turbopackIgnore: true */ dir)
      .filter((n) => /^\d+$/.test(n) || /^\d{6}$/.test(n));
    if (parts.length < total) {
      return ok({ received: index, total, complete: false });
    }

    ensureUserDir(userId);
    const rel = toPosixRel(parentPath ? `${parentPath}/${fileName}` : fileName);
    const abs = resolveUserPath(userId, rel);
    fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(abs), { recursive: true });
    const writer = fs.createWriteStream(/* turbopackIgnore: true */ abs);
    let bytes = 0;
    for (let i = 0; i < total; i++) {
      const p = path.join(dir, String(i).padStart(6, "0"));
      const chunk = fs.readFileSync(/* turbopackIgnore: true */ p);
      bytes += chunk.length;
      writer.write(chunk);
    }
    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on("error", reject);
    });
    fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });

    const row = await prisma.backupFile.upsert({
      where: { userId_path: { userId, path: rel } },
      create: {
        userId,
        path: rel,
        name: fileName,
        parentPath,
        isDir: false,
        size: BigInt(bytes),
        mimeType: mime,
      },
      update: { size: BigInt(bytes), mimeType: mime },
    });

    await writeLog({
      type: "USER_UPLOAD",
      message: `Chunked upload assembled ${rel} (${bytes} bytes)`,
      userId,
      userEmail: session.user.email,
      ...clientMeta(request),
      metadata: { path: rel, bytes, chunks: total },
    });

    return ok({ complete: true, file: { ...row, size: Number(row.size) } }, { status: 201 });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Chunk upload failed");
  }
}
