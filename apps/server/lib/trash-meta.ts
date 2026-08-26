import fs from "node:fs";
import path from "node:path";
import { resolveUserPath, toPosixRel } from "@/lib/storage";

type TrashMeta = Record<string, string>;

function metaAbs(userId: string): string {
  return resolveUserPath(userId, "Trash/.hbs-trash-meta.json");
}

export function readTrashMeta(userId: string): TrashMeta {
  try {
    const raw = fs.readFileSync(/* turbopackIgnore: true */ metaAbs(userId), "utf8");
    const parsed = JSON.parse(raw) as TrashMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberTrashOriginal(userId: string, trashRel: string, originalPath: string) {
  const meta = readTrashMeta(userId);
  meta[toPosixRel(trashRel)] = toPosixRel(originalPath);
  const abs = metaAbs(userId);
  fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(abs), { recursive: true });
  fs.writeFileSync(/* turbopackIgnore: true */ abs, JSON.stringify(meta, null, 2));
}

export function forgetTrashOriginal(userId: string, trashRel: string) {
  const meta = readTrashMeta(userId);
  delete meta[toPosixRel(trashRel)];
  const abs = metaAbs(userId);
  try {
    fs.writeFileSync(/* turbopackIgnore: true */ abs, JSON.stringify(meta, null, 2));
  } catch {
    /* ignore */
  }
}

export function originalPathForTrash(userId: string, trashRel: string): string {
  const meta = readTrashMeta(userId);
  return meta[toPosixRel(trashRel)] || "";
}
