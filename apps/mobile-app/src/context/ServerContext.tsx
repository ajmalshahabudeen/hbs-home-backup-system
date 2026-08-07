import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Network from 'expo-network';
import { appStorage } from '../utils/storage';

export interface DiscoveredServer {
  ip: string;
  url: string;
  responseTimeMs: number;
}

interface ServerContextType {
  serverUrl: string;
  isConnected: boolean;
  isChecking: boolean;
  isScanning: boolean;
  scanProgress: { scanned: number; total: number };
  discoveredServers: DiscoveredServer[];
  setServerUrl: (url: string) => Promise<boolean>;
  testConnection: (url?: string) => Promise<boolean>;
  scanLanSubnet: () => Promise<DiscoveredServer[]>;
}

const SERVER_URL_KEY = 'hbs_server_url';
const DEFAULT_PORT = 38480;
const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

const ServerContext = createContext<ServerContextType>({
  serverUrl: DEFAULT_URL,
  isConnected: false,
  isChecking: true,
  isScanning: false,
  scanProgress: { scanned: 0, total: 0 },
  discoveredServers: [],
  setServerUrl: async () => false,
  testConnection: async () => false,
  scanLanSubnet: async () => [],
});

export function normalizeServerUrl(input: string): string {
  let cleaned = (input || '').trim();
  if (!cleaned) return DEFAULT_URL;

  // Add http:// if missing scheme
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `http://${cleaned}`;
  }

  // Remove trailing slashes and paths
  cleaned = cleaned.replace(/\/+$/, '');

  // Extract protocol, host, port safely with regex
  const match = cleaned.match(/^(https?:\/\/)([^:/]+)(:(\d+))?/i);
  if (match) {
    const protocol = match[1] || 'http://';
    const host = match[2];
    const port = match[4] || String(DEFAULT_PORT);
    return `${protocol}${host}:${port}`;
  }

  return cleaned;
}

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_URL);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number }>({
    scanned: 0,
    total: 0,
  });
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);

  const testConnection = async (targetUrl?: string): Promise<boolean> => {
    const urlToTest = normalizeServerUrl(targetUrl || serverUrl);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(`${urlToTest}/api/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        setIsConnected(true);
        return true;
      }
    } catch {
      // offline or unreachable
    }
    setIsConnected(false);
    return false;
  };

  const updateServerUrl = async (url: string): Promise<boolean> => {
    const normalized = normalizeServerUrl(url);
    setIsChecking(true);
    setServerUrlState(normalized);
    await appStorage.setItem(SERVER_URL_KEY, normalized).catch(() => {});
    const valid = await testConnection(normalized);
    setIsChecking(false);
    return valid;
  };

  const scanLanSubnet = async (): Promise<DiscoveredServer[]> => {
    setIsScanning(true);
    setDiscoveredServers([]);
    const found: DiscoveredServer[] = [];

    let deviceIp: string | null = null;
    try {
      deviceIp = await Network.getIpAddressAsync();
    } catch {
      // ignore
    }

    const subnetsToScan: string[] = [];

    if (deviceIp && deviceIp !== '127.0.0.1' && deviceIp !== '0.0.0.0') {
      const ipv4Match = deviceIp.match(/(?:\d{1,3}\.){3}\d{1,3}/);
      const cleanIp = ipv4Match ? ipv4Match[0] : deviceIp;
      const parts = cleanIp.split('.');
      if (parts.length === 4) {
        subnetsToScan.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }

    if (subnetsToScan.length === 0) {
      subnetsToScan.push('192.168.1');
    }

    // Fast path: Check loopback, emulator hosts, and standard LAN IPs
    const fastCandidates = Array.from(
      new Set([
        '192.168.1.100',
        '127.0.0.1',
        '10.0.2.2',
        'localhost',
        ...(deviceIp ? [deviceIp] : []),
      ])
    );

    for (const host of fastCandidates) {
      const target = `http://${host}:${DEFAULT_PORT}`;
      const start = Date.now();
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${target}/api/health`, { signal: controller.signal });
        clearTimeout(tid);
        if (res.ok) {
          found.push({ ip: host, url: target, responseTimeMs: Date.now() - start });
        }
      } catch {
        // continue
      }
    }

    // Sweep across subnet in small batches of 15
    const primarySubnet = subnetsToScan[0];
    const totalHosts = 254;
    setScanProgress({ scanned: 0, total: totalHosts });

    const batchSize = 15;
    let scannedCount = 0;

    for (let i = 1; i <= totalHosts; i += batchSize) {
      const batchPromises: Promise<void>[] = [];

      for (let j = i; j < i + batchSize && j <= totalHosts; j++) {
        const hostIp = `${primarySubnet}.${j}`;
        const target = `http://${hostIp}:${DEFAULT_PORT}`;

        batchPromises.push(
          (async () => {
            const startTime = Date.now();
            try {
              const controller = new AbortController();
              const tid = setTimeout(() => controller.abort(), 1200);
              const res = await fetch(`${target}/api/health`, {
                signal: controller.signal,
              });
              clearTimeout(tid);

              if (res.ok) {
                const elapsed = Date.now() - startTime;
                if (!found.some((f) => f.url === target)) {
                  found.push({ ip: hostIp, url: target, responseTimeMs: elapsed });
                }
              }
            } catch {
              // unreachable
            } finally {
              scannedCount++;
              setScanProgress({ scanned: scannedCount, total: totalHosts });
            }
          })()
        );
      }

      await Promise.all(batchPromises);
    }

    setDiscoveredServers(found);
    setIsScanning(false);

    return found;
  };

  useEffect(() => {
    (async () => {
      setIsChecking(true);
      const saved = await appStorage.getItem(SERVER_URL_KEY);
      const initialUrl = saved ? normalizeServerUrl(saved) : DEFAULT_URL;
      setServerUrlState(initialUrl);
      await testConnection(initialUrl);
      setIsChecking(false);
    })();
  }, []);

  return (
    <ServerContext.Provider
      value={{
        serverUrl,
        isConnected,
        isChecking,
        isScanning,
        scanProgress,
        discoveredServers,
        setServerUrl: updateServerUrl,
        testConnection,
        scanLanSubnet,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
};

export const useServer = () => useContext(ServerContext);
