import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStorageRoot } from "@/lib/storage";

export const DEFAULT_LAN_HOSTNAME = "zoro.local";
export const DEFAULT_APP_PORT = Number(process.env.PORT || process.env.APP_PORT || 38480);

const GENERIC = new Set([
  "localhost",
  "hbs-server",
  "hbs-worker",
  "hbs-beat",
  "server",
  "app",
  "container",
]);

export type LanHostInfo = {
  hostname: string;
  url: string;
  port: number;
  source: "env" | "file" | "os" | "default";
  needsSetup: boolean;
};

function persistPath(): string {
  return path.join(getStorageRoot(), ".hbs-lan-host");
}

export function normalizeLanHostname(raw: string): string {
  let h = raw.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0] || "";
  h = h.replace(/:\d+$/, "");
  h = h.replace(/\.+$/, "");
  if (!h) return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return "";
  if (h.includes(".") || h.endsWith(".local")) return h;
  return `${h}.local`;
}

function isGeneric(hostname: string): boolean {
  const bare = hostname.replace(/\.local$/, "");
  if (GENERIC.has(hostname) || GENERIC.has(bare)) return true;
  if (/^[0-9a-f]{12,}$/.test(bare)) return true;
  return false;
}

function readPersisted(): string {
  try {
    const raw = fs.readFileSync(persistPath(), "utf8").trim();
    return normalizeLanHostname(raw);
  } catch {
    return "";
  }
}

export function saveLanHostname(raw: string): string {
  const hostname = normalizeLanHostname(raw);
  if (!hostname) {
    throw new Error("Enter a hostname like zoro.local (not an IP address).");
  }
  const dir = getStorageRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(persistPath(), `${hostname}\n`, "utf8");
  process.env.HBS_HOSTNAME = hostname;
  return hostname;
}

export function getLanHostInfo(): LanHostInfo {
  const port = DEFAULT_APP_PORT;

  const envRaw = (
    process.env.HBS_HOSTNAME ||
    process.env.HBS_PUBLIC_HOST ||
    ""
  ).trim();
  const fromEnv = normalizeLanHostname(envRaw);
  if (fromEnv && !isGeneric(fromEnv)) {
    return {
      hostname: fromEnv,
      url: `http://${fromEnv}:${port}`,
      port,
      source: "env",
      needsSetup: false,
    };
  }

  const fromFile = readPersisted();
  if (fromFile && !isGeneric(fromFile)) {
    return {
      hostname: fromFile,
      url: `http://${fromFile}:${port}`,
      port,
      source: "file",
      needsSetup: false,
    };
  }

  const fromOs = normalizeLanHostname(os.hostname());
  if (fromOs && !isGeneric(fromOs)) {
    return {
      hostname: fromOs,
      url: `http://${fromOs}:${port}`,
      port,
      source: "os",
      needsSetup: false,
    };
  }

  return {
    hostname: DEFAULT_LAN_HOSTNAME,
    url: `http://${DEFAULT_LAN_HOSTNAME}:${port}`,
    port,
    source: "default",
    needsSetup: true,
  };
}
