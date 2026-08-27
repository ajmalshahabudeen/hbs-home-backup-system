import crypto from "node:crypto";
import fs from "node:fs";
import { term } from "@/lib/term-log";

const MAGIC = Buffer.from("HBS2");

export function atRestEnabled(): boolean {
  return Boolean(
    process.env.HBS_AT_REST_KEY && process.env.HBS_AT_REST_KEY.length >= 16,
  );
}

function key(): Buffer {
  return crypto
    .createHash("sha256")
    .update(process.env.HBS_AT_REST_KEY || "")
    .digest();
}

export function isAtRestEncrypted(buf: Buffer): boolean {
  return buf.length >= 4 + 12 + 16 && buf.subarray(0, 4).equals(MAGIC);
}

export async function encryptAtRestFile(abs: string): Promise<void> {
  if (!atRestEnabled()) return;
  const plain = await fs.promises.readFile(/* turbopackIgnore: true */ abs);
  if (isAtRestEncrypted(plain)) {
    term(
      "FS",
      "at-rest already encrypted",
      { abs, bytes: plain.length },
      "trace",
    );
    return;
  }
  term("FS", "→ encrypt at-rest", { abs, bytes: plain.length });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  await fs.promises.writeFile(
    /* turbopackIgnore: true */ abs,
    Buffer.concat([MAGIC, iv, tag, enc]),
  );
  term("FS", "← encrypt at-rest ok", { abs, bytes: enc.length });
}

export async function decryptAtRestToBuffer(abs: string): Promise<Buffer> {
  const raw = await fs.promises.readFile(/* turbopackIgnore: true */ abs);
  if (!isAtRestEncrypted(raw)) {
    term("FS", "at-rest plaintext read", { abs, bytes: raw.length }, "trace");
    return raw;
  }
  if (!atRestEnabled())
    throw new Error("File is encrypted at rest but HBS_AT_REST_KEY is not set");
  term("FS", "→ decrypt at-rest", { abs, bytes: raw.length });
  const iv = raw.subarray(4, 16);
  const tag = raw.subarray(16, 32);
  const enc = raw.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  term("FS", "← decrypt at-rest ok", { abs, bytes: out.length });
  return out;
}
