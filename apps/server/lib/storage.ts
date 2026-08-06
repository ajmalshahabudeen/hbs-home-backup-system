import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * Resolve the backup storage root.
 * - In Docker: STORAGE_ROOT=/data/storage (HOST_STORAGE_PATH mounted there)
 * - On Windows host: F:/ or F:\HBS-Backups
 * - On Linux host: /mnt/data, /var/hbs-storage, etc.
 */
export function getStorageRoot(): string {
  const raw =
    process.env.STORAGE_ROOT ||
    process.env.HOST_STORAGE_PATH ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "storage");

  let resolved = raw.trim();

  if (resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  }

  resolved = resolved.replace(/\\/g, "/");

  if (
    path.isAbsolute(resolved) ||
    /^[a-zA-Z]:\//.test(resolved) ||
    resolved.startsWith("/")
  ) {
    if (
      process.platform !== "win32" &&
      /^[a-zA-Z]:\//.test(resolved) &&
      !fs.existsSync(resolved)
    ) {
      const dockerDefault = "/data/storage";
      if (fs.existsSync(dockerDefault)) return dockerDefault;
    }
    return path.normalize(resolved);
  }

  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    resolved
  );
}

/** Absolute path for a user's private backup tree */
export function userStorageRoot(userId: string): string {
  return path.join(getStorageRoot(), "users", userId);
}

/**
 * Resolve a relative user path safely (blocks path traversal).
 * relativePath uses posix separators, no leading slash.
 */
export function resolveUserPath(userId: string, relativePath = ""): string {
  const root = userStorageRoot(userId);
  const cleaned = (relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join(path.sep);

  const full = path.resolve(/* turbopackIgnore: true */ root, cleaned);
  const rootResolved = path.resolve(/* turbopackIgnore: true */ root);

  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid path: traversal blocked");
  }

  return full;
}

export function ensureStorageReady(): {
  ok: boolean;
  root: string;
  error?: string;
} {
  const root = getStorageRoot();
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, "users"), { recursive: true });
    const probe = path.join(root, ".hbs-write-probe");
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    return { ok: true, root };
  } catch (e) {
    return {
      ok: false,
      root,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function ensureUserDir(userId: string): string {
  const dir = userStorageRoot(userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function toPosixRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}
