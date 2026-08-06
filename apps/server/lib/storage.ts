import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";

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

/** Host-facing path from env (e.g. G:/HBS-Backups) — may differ from container path. */
export function getHostStoragePath(): string {
  return (
    process.env.HOST_STORAGE_PATH ||
    process.env.STORAGE_ROOT ||
    getStorageRoot()
  )
    .trim()
    .replace(/\\/g, "/");
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

export type DiskUsage = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  available: boolean;
  error?: string;
};

function diskFromStatfs(target: string): DiskUsage | null {
  try {
    // Node 18.15+ / 20+
    const statfs = (
      fs as typeof fs & {
        statfsSync?: (p: string) => {
          bsize: number;
          blocks: number;
          bavail: number;
          bfree: number;
        };
      }
    ).statfsSync;
    if (!statfs) return null;
    const s = statfs(target);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
      available: true,
    };
  } catch {
    return null;
  }
}

function diskFromDf(target: string): DiskUsage | null {
  try {
    const out = execSync(`df -kP ${JSON.stringify(target)}`, {
      encoding: "utf8",
      timeout: 3000,
    });
    const lines = out.trim().split("\n");
    const data = lines[lines.length - 1];
    if (!data) return null;
    const parts = data.split(/\s+/);
    // Filesystem 1024-blocks Used Available Capacity Mounted
    const totalK = Number(parts[1]);
    const usedK = Number(parts[2]);
    const freeK = Number(parts[3]);
    if (!Number.isFinite(totalK)) return null;
    const totalBytes = totalK * 1024;
    const freeBytes = freeK * 1024;
    const usedBytes = usedK * 1024;
    const usedPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
      available: true,
    };
  } catch (e) {
    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      usedPercent: 0,
      available: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function getDiskUsage(target = getStorageRoot()): DiskUsage {
  const fromStat = diskFromStatfs(target);
  if (fromStat) return fromStat;
  const fromDf = diskFromDf(target);
  if (fromDf) return fromDf;
  return {
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    usedPercent: 0,
    available: false,
    error: "Disk usage unavailable on this platform",
  };
}

function parseDriveLetter(p: string): string | null {
  const m = /^([A-Za-z]):/.exec(p.replace(/\\/g, "/"));
  return m ? `${m[1]!.toUpperCase()}:` : null;
}

function storageDisplayName(hostPath: string, containerPath: string): string {
  const drive = parseDriveLetter(hostPath);
  if (drive) {
    const rest = hostPath.replace(/\\/g, "/").replace(/^[A-Za-z]:\/?/, "");
    return rest ? `${drive} ${rest.split("/").filter(Boolean).join(" / ")}` : `${drive} Drive`;
  }
  const base = path.basename(hostPath || containerPath) || "storage";
  return base;
}

export type StorageInfo = {
  ok: boolean;
  writable: boolean;
  exists: boolean;
  root: string;
  hostPath: string;
  containerPath: string;
  driveLetter: string | null;
  name: string;
  platform: string;
  hostname: string;
  error?: string;
  disk: DiskUsage;
  checkedAt: string;
};

export function getStorageInfo(): StorageInfo {
  const containerPath = getStorageRoot();
  const hostPath = getHostStoragePath();
  const ready = ensureStorageReady();
  const exists = fs.existsSync(/* turbopackIgnore: true */ containerPath);
  const disk = getDiskUsage(containerPath);

  return {
    ok: ready.ok && disk.available !== false,
    writable: ready.ok,
    exists,
    root: containerPath,
    hostPath,
    containerPath,
    driveLetter: parseDriveLetter(hostPath),
    name: storageDisplayName(hostPath, containerPath),
    platform: process.platform,
    hostname: os.hostname(),
    error: ready.error || disk.error,
    disk,
    checkedAt: new Date().toISOString(),
  };
}
