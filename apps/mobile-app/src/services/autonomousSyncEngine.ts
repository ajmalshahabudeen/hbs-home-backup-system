import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { Platform } from 'react-native';
import { appStorage } from '../utils/storage';
import { safeMediaLibrary, filterAssetsBySelectedAlbums, SafeAsset } from '../utils/safeMediaLibrary';
import { backupIndexDb } from '../utils/backupIndexDb';
import { hbsApi } from './api';
import { autoAuthenticateUser } from '../context/AuthContext';
import { safeNotifications } from '../utils/safeNotifications';
import { runParallelUploadQueue } from '../utils/parallelUploadQueue';
import { syncTracker } from './syncTracker';
import {
  getSyncConfig,
  saveSyncConfig,
  isBatteryOkForSync,
  isNetworkOkForSync,
} from './backgroundSync';

export interface AutonomousSyncResult {
  success: boolean;
  syncedCount?: number;
  skippedCount?: number;
  totalFound?: number;
  serverUrl?: string;
  reason?: string;
}

let isAutonomousSyncRunning = false;

/**
 * Fast LAN discovery helper.
 * Tests known default server IPs and subnet candidates concurrently,
 * returning the first reachable HBS server (port 38480).
 */
async function discoverLanServer(savedUrl?: string): Promise<string | null> {
  const candidates: string[] = [];

  if (savedUrl) candidates.push(savedUrl);
  candidates.push('http://192.168.1.100:38480');
  candidates.push('http://192.168.0.100:38480');
  candidates.push('http://192.168.1.50:38480');
  candidates.push('http://192.168.0.50:38480');
  candidates.push('http://127.0.0.1:38480');

  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && ip.includes('.')) {
      const prefix = ip.substring(0, ip.lastIndexOf('.'));
      candidates.push(`http://${prefix}.100:38480`);
      candidates.push(`http://${prefix}.50:38480`);
      candidates.push(`http://${prefix}.1:38480`);
    }
  } catch {
    // ignore
  }

  const uniqueCandidates = Array.from(new Set(candidates));

  // Test current saved first with short timeout
  for (const url of uniqueCandidates.slice(0, 2)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        return url;
      }
    } catch {
      // continue
    }
  }

  // Sweep remaining candidates in parallel
  const probePromises = uniqueCandidates.map(async (url) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return url;
    } catch {
      // not reachable
    }
    return null;
  });

  const results = await Promise.all(probePromises);
  const found = results.find((r) => r !== null);
  return found || null;
}

/**
 * Generates or retrieves a persistent, unique mobile device ID.
 */
async function getOrCreateDeviceId(): Promise<string> {
  let id = await appStorage.getItem('hbs_device_unique_id');
  if (!id) {
    id = `device_${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await appStorage.setItem('hbs_device_unique_id', id);
  }
  return id;
}

/**
 * Autonomous Background Photo & Video Sync Engine.
 * Executed silently during mobile idle / background task or server wake-up push notification.
 * 
 * 1. Validates Wi-Fi & Battery guards (as per settings & backup preferences).
 * 2. Probes LAN server; auto-discovers if the server IP changed.
 * 3. Restores / auto-authenticates session with stored credentials without prompting user.
 * 4. Registers device info and push token with server for future wake-ups.
 * 5. Performs fast local SQLite delta check on camera roll assets.
 * 6. Silently uploads new files in parallel, updates SQLite index, and finishes cleanly.
 */
export async function runAutonomousSync(options?: {
  force?: boolean;
  serverUrlOverride?: string;
  source?: string;
}): Promise<AutonomousSyncResult> {
  if (isAutonomousSyncRunning) {
    return { success: false, reason: 'Autonomous sync is already in progress' };
  }

  isAutonomousSyncRunning = true;

  try {
    const config = await getSyncConfig();

    // 1. Check if auto-sync is enabled (unless forced by manual trigger or push)
    if (!config.autoSyncEnabled && !options?.force) {
      return { success: false, reason: 'Background auto-sync is disabled by user' };
    }

    // 2. Enforce Wi-Fi Only constraint
    const networkCheck = await isNetworkOkForSync(config.wifiOnly);
    if (!networkCheck.ok && !options?.force) {
      return { success: false, reason: networkCheck.reason || 'Wi-Fi not available' };
    }

    // 3. Enforce Battery Saver constraint
    const batteryCheck = await isBatteryOkForSync(config.pauseOnLowBattery);
    if (!batteryCheck.ok && !options?.force) {
      return { success: false, reason: batteryCheck.reason || 'Battery low' };
    }

    // 4. Server Discovery & Health Probe
    const savedUrl = (await appStorage.getItem('hbs_server_url')) || 'http://192.168.1.100:38480';
    const targetUrl = options?.serverUrlOverride || (await discoverLanServer(savedUrl));

    if (!targetUrl) {
      return { success: false, reason: 'No HBS server detected on LAN (port 38480)' };
    }

    // Save discovered URL if it changed
    if (targetUrl !== savedUrl) {
      await appStorage.setItem('hbs_server_url', targetUrl);
    }

    // 5. Auto Re-Authentication / Session Renewal
    const authResult = await autoAuthenticateUser(targetUrl);
    const sessionToken = authResult.token;

    if (!sessionToken && !authResult.user) {
      return {
        success: false,
        reason: 'Not authenticated on server. User signed out or credentials missing.',
      };
    }

    // 6. Device Registration & Heartbeat with Server
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = Device.modelName || Device.deviceName || `${Platform.OS} Device`;
      const pushToken = await safeNotifications.getExpoPushTokenAsync();
      let localIp: string | undefined;
      try {
        localIp = await Network.getIpAddressAsync();
      } catch {
        // ignore
      }

      await hbsApi.registerDevice(targetUrl, sessionToken, {
        deviceId,
        deviceName,
        platform: Platform.OS,
        pushToken: pushToken || undefined,
        localIp,
      });
    } catch {
      // Device registration failure should not block backup
    }

    // 7. Local Media Delta Discovery (Fast Local SQLite Indexing)
    const { status } = await safeMediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, reason: 'Media library permission not granted' };
    }

    const allAssets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
    const scopedAssets = filterAssetsBySelectedAlbums(allAssets, config.selectedAlbums);

    if (!scopedAssets || scopedAssets.length === 0) {
      return { success: true, syncedCount: 0, skippedCount: 0, totalFound: 0 };
    }

    // Filter out assets that are already indexed in local SQLite (0ms network cost)
    const newAssetsToUpload: SafeAsset[] = [];
    let indexedDuplicatesCount = 0;

    for (const asset of scopedAssets) {
      const rawName = asset.filename ? asset.filename.split('/').pop() || asset.filename : '';
      const isUploaded = backupIndexDb.isLocallyUploaded(asset.uri, undefined, rawName, undefined);
      if (isUploaded) {
        indexedDuplicatesCount++;
      } else {
        newAssetsToUpload.push(asset);
      }
    }

    if (newAssetsToUpload.length === 0) {
      return {
        success: true,
        syncedCount: 0,
        skippedCount: indexedDuplicatesCount,
        totalFound: scopedAssets.length,
      };
    }

    // 8. Execute Parallel Concurrency Upload Queue
    await syncTracker.startSync(newAssetsToUpload.length, 'Starting autonomous background backup...');

    const uploadResult = await runParallelUploadQueue(
      targetUrl,
      sessionToken,
      newAssetsToUpload,
      4,
      'MobileBackups',
      (progress) => {
        syncTracker.updateProgress(
          progress.completed,
          progress.total,
          progress.currentFileName || 'Processing...',
          `Backing up ${progress.completed}/${progress.total} (${progress.syncedCount} new, ${progress.skippedCount} skipped)`,
          progress.skippedCount + indexedDuplicatesCount
        );
      }
    );

    await syncTracker.finishSync(
      uploadResult.syncedCount,
      uploadResult.skippedCount + indexedDuplicatesCount
    );

    await saveSyncConfig({
      lastSyncTimestamp: new Date().toISOString(),
      totalSyncedCount: (config.totalSyncedCount || 0) + uploadResult.syncedCount,
    });

    return {
      success: true,
      syncedCount: uploadResult.syncedCount,
      skippedCount: uploadResult.skippedCount + indexedDuplicatesCount,
      totalFound: scopedAssets.length,
      serverUrl: targetUrl,
    };
  } catch (err) {
    await syncTracker.finishSync(0, 0);
    return {
      success: false,
      reason: err instanceof Error ? err.message : 'Autonomous backup encountered an error',
    };
  } finally {
    isAutonomousSyncRunning = false;
  }
}
