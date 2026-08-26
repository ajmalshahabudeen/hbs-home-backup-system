import { NextRequest } from "next/server";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma } from "@workspace/db";
import { requireSession, ok, badRequest } from "@/lib/auth-guard";
import { resolveUserPath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sha256File(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(abs);
    stream.on("data", (c) => hash.update(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession(request);
  if (error) return error;
  const body = (await request.json()) as { id?: string };
  if (!body.id) return badRequest("id required");
  const row = await prisma.backupFile.findFirst({
    where: { id: body.id, userId: session.user.id, isDir: false },
  });
  if (!row) return badRequest("File not found");
  const abs = resolveUserPath(session.user.id, row.path);
  if (!fs.existsSync(abs)) return badRequest("File missing on disk");
  const actual = await sha256File(abs);
  const expected = row.checksum || null;
  if (!expected) {
    await prisma.backupFile.update({ where: { id: row.id }, data: { checksum: actual } });
    return ok({ ok: true, recorded: true, checksum: actual });
  }
  const match = expected === actual;
  return ok({ ok: match, expected, actual, bitrot: !match });
}
