import fs from "node:fs";
import path from "node:path";
import { prisma } from "@workspace/db";
import chokidar, { type FSWatcher } from "chokidar";
import { getStorageRoot, toPosixRel } from "./storage";
import { term } from "./term-log";
import { broadcastDriveChange } from "./ws-server";

let watcher: FSWatcher | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return ext && map[ext] ? map[ext] : null;
}

/**
 * Parses an absolute path inside STORAGE_ROOT/users/{userId}/...
 * Returns { userId, relativePath, parentPath, fileName } or null if invalid.
 */
function parseUserStoragePath(absPath: string): {
  userId: string;
  relativePath: string;
  parentPath: string;
  fileName: string;
} | null {
  const usersDir = path.join(getStorageRoot(), "users");
  const normalized = path.normalize(absPath);
  const normalizedUsersDir = path.normalize(usersDir);

  if (!normalized.startsWith(normalizedUsersDir)) return null;

  const relFromUsers = path.relative(normalizedUsersDir, normalized);
  const parts = relFromUsers.split(path.sep).filter(Boolean);

  if (parts.length < 1) return null;
  const userId = parts[0];
  if (!userId) return null;

  const userSubParts = parts.slice(1);
  if (userSubParts.length === 0) {
    return {
      userId,
      relativePath: "",
      parentPath: "",
      fileName: "",
    };
  }

  const relativePath = toPosixRel(userSubParts.join("/"));
  const fileName = path.basename(relativePath);
  const parentPath =
    path.dirname(relativePath) === "."
      ? ""
      : toPosixRel(path.dirname(relativePath));

  return {
    userId,
    relativePath,
    parentPath,
    fileName,
  };
}

/**
 * Handle debounced file add or modification event from watcher.
 */
async function handleFileAddedOrChanged(absPath: string) {
  const parsed = parseUserStoragePath(absPath);
  if (!parsed || !parsed.relativePath) return;

  const { userId, relativePath, parentPath, fileName } = parsed;

  // Ignore system files
  if (
    fileName.startsWith(".") ||
    fileName.includes(".hbs-thumb") ||
    fileName.endsWith(".tmp") ||
    fileName.endsWith(".crdownload") ||
    fileName.endsWith(".part")
  ) {
    return;
  }

  try {
    if (!fs.existsSync(absPath)) return;
    const st = fs.statSync(absPath);
    const isDir = st.isDirectory();

    const record = await prisma.backupFile.upsert({
      where: { userId_path: { userId, path: relativePath } },
      create: {
        userId,
        path: relativePath,
        name: fileName,
        parentPath,
        isDir,
        size: BigInt(isDir ? 0 : st.size),
        mimeType: isDir ? null : guessMime(fileName),
      },
      update: {
        name: fileName,
        isDir,
        size: BigInt(isDir ? 0 : st.size),
        mimeType: isDir ? null : guessMime(fileName),
      },
    });

    term("FS", `storage-watcher synced: ${relativePath} for user ${userId}`);

    broadcastDriveChange({
      userId,
      action: "fs_change",
      path: parentPath,
      file: {
        id: record.id,
        name: record.name,
        path: record.path,
        parentPath: record.parentPath,
        isDir: record.isDir,
        size: Number(record.size),
        mimeType: record.mimeType,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (err) {
    term("ERROR", "storage-watcher upsert error", { relativePath, err });
  }
}

/**
 * Handle debounced file removal event from watcher.
 */
async function handleFileRemoved(absPath: string) {
  const parsed = parseUserStoragePath(absPath);
  if (!parsed || !parsed.relativePath) return;

  const { userId, relativePath, parentPath, fileName } = parsed;

  if (
    fileName.startsWith(".") ||
    fileName.includes(".hbs-thumb") ||
    fileName.endsWith(".tmp")
  ) {
    return;
  }

  try {
    await prisma.backupFile.deleteMany({
      where: {
        userId,
        OR: [
          { path: relativePath },
          { path: { startsWith: `${relativePath}/` } },
        ],
      },
    });

    term(
      "FS",
      `storage-watcher deleted record: ${relativePath} for user ${userId}`,
    );

    broadcastDriveChange({
      userId,
      action: "delete",
      path: parentPath,
      file: {
        path: relativePath,
        name: fileName,
        parentPath,
      },
    });
  } catch (err) {
    term("ERROR", "storage-watcher delete error", { relativePath, err });
  }
}

/**
 * Debounce wrapper for path events.
 */
function queueEvent(absPath: string, type: "add" | "change" | "unlink") {
  const existing = debounceTimers.get(absPath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debounceTimers.delete(absPath);
    if (type === "unlink") {
      void handleFileRemoved(absPath);
    } else {
      void handleFileAddedOrChanged(absPath);
    }
  }, 450);

  debounceTimers.set(absPath, timer);
}

/**
 * Initialize storage filesystem watcher.
 */
export function initStorageWatcher(): FSWatcher | null {
  if (watcher) return watcher;

  const usersDir = path.join(getStorageRoot(), "users");
  try {
    if (!fs.existsSync(usersDir)) {
      fs.mkdirSync(usersDir, { recursive: true });
    }

    watcher = chokidar.watch(usersDir, {
      ignored: [
        /(^|[/\\])\../, // ignore dotfiles
        /\.hbs-thumb/, // ignore thumbnails
        /\.tmp$/, // ignore temp files
      ],
      persistent: true,
      ignoreInitial: true, // Don't fire for existing files on boot
      depth: 15,
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100,
      },
    });

    watcher
      .on("add", (filePath) => queueEvent(filePath, "add"))
      .on("change", (filePath) => queueEvent(filePath, "change"))
      .on("unlink", (filePath) => queueEvent(filePath, "unlink"))
      .on("addDir", (dirPath) => queueEvent(dirPath, "add"))
      .on("unlinkDir", (dirPath) => queueEvent(dirPath, "unlink"))
      .on("error", (err) =>
        term("ERROR", "chokidar storage watcher error", { err }),
      );

    term("FS", `Storage watcher active on ${usersDir}`);
  } catch (err) {
    term("ERROR", "failed to initialize storage watcher", { err });
  }

  return watcher;
}

export function stopStorageWatcher() {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}
