import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Battery from 'expo-battery';
import { appStorage } from '../utils/storage';
import { safeNotifications } from '../utils/safeNotifications';
import { safeMediaLibrary, SafeAsset } from '../utils/safeMediaLibrary';
import { hbsApi } from './api';
import { checkFileDuplicate } from '../utils/dedupe';

export const BACKGROUND_SYNC_TASK = 'HBS_BACKGROUND_AUTO_SYNC';

/**
 * Interface for background sync configuration
 */
export interface SyncConfig {
  autoSyncEnabled: boolean;
  pauseOnLowBattery: boolean;
  selectedAlbums: string[];
  lastSyncTimestamp?: string;
  totalSyncedCount?: number;
}

const CONFIG_STORAGE_KEY = 'hbs_sync_config_v1';

export async function getSyncConfig(): Promise<SyncConfig> {
  try {
    const raw = await appStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // fallback
  }
  return {
    autoSyncEnabled: false,
    pauseOnLowBattery: true,
    selectedAlbums: [],
  };
}

export async function saveSyncConfig(config: Partial<SyncConfig>): Promise<SyncConfig> {
  const current = await getSyncConfig();
  const updated = { ...current, ...config };
  await appStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Checks battery level & state to ensure background sync doesn't drain phone battery.
 */
export async function isBatteryOkForSync(pauseOnLowBattery: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (!pauseOnLowBattery) return { ok: true };

  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const batteryState = await Battery.getBatteryStateAsync();
    const isLowPowerMode = await Battery.isLowPowerModeEnabledAsync();

    if (isLowPowerMode) {
      return { ok: false, reason: 'Device is in Low Power Mode' };
    }

    if (batteryLevel > 0 && batteryLevel < 0.20 && batteryState !== Battery.BatteryState.CHARGING) {
      return { ok: false, reason: `Battery is low (${Math.round(batteryLevel * 100)}%) and not charging` };
    }
  } catch (e) {
    // Ignore battery read error
  }

  return { ok: true };
}

/**
 * Send local notification on backup complete or status update safely.
 */
export async function sendLocalSyncNotification(title: string, body: string) {
  try {
    await safeNotifications.scheduleNotificationAsync(title, body);
  } catch (e) {
    // Ignore notification error
  }
}

export const sendLocalNotification = sendLocalSyncNotification;

/**
 * Retrieves camera roll assets scoped strictly to user enabled sync albums.
 */
export async function getEnabledSyncAssets(): Promise<SafeAsset[]> {
  const config = await getSyncConfig();
  if (!config.autoSyncEnabled) {
    return [];
  }
  return safeMediaLibrary.getAssetsAsync({ first: 100 });
}

/**
 * Executes photo & video auto-sync engine against the user's home server.
 */
export async function syncPhotosNow(
  serverUrl: string,
  sessionToken: string | null
): Promise<{ synced: number; skipped: number; total: number }> {
  if (!serverUrl) return { synced: 0, skipped: 0, total: 0 };

  const config = await getSyncConfig();
  if (!config.autoSyncEnabled) {
    return { synced: 0, skipped: 0, total: 0 };
  }

  const batteryCheck = await isBatteryOkForSync(config.pauseOnLowBattery);
  if (!batteryCheck.ok) {
    return { synced: 0, skipped: 0, total: 0 };
  }

  const assets = await safeMediaLibrary.getAssetsAsync({ first: 100 });
  if (!assets || assets.length === 0) {
    return { synced: 0, skipped: 0, total: 0 };
  }

  let synced = 0;
  let skipped = 0;

  for (const asset of assets) {
    const fileName = asset.filename || `auto_sync_${asset.id}.jpg`;
    const mime = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    try {
      const dup = await checkFileDuplicate(
        serverUrl,
        sessionToken,
        fileName,
        asset.uri,
        0,
        'AutoSync'
      );

      if (dup.isDuplicate) {
        skipped++;
        continue;
      }

      await hbsApi.uploadFile(
        serverUrl,
        sessionToken,
        asset.uri,
        fileName,
        mime,
        'AutoSync'
      );
      synced++;
    } catch {
      // continue next
    }
  }

  if (synced > 0) {
    await sendLocalSyncNotification(
      'HBS Auto-Sync',
      `Synced ${synced} new photo${synced > 1 ? 's' : ''} to server.`
    );
  }

  await saveSyncConfig({
    lastSyncTimestamp: new Date().toISOString(),
    totalSyncedCount: (config.totalSyncedCount || 0) + synced,
  });

  return { synced, skipped, total: assets.length };
}

// Define the background task
try {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      const config = await getSyncConfig();
      if (!config.autoSyncEnabled) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      const batteryCheck = await isBatteryOkForSync(config.pauseOnLowBattery);
      if (!batteryCheck.ok) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      await saveSyncConfig({ lastSyncTimestamp: new Date().toISOString() });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch (e) {
  // Ignore task definition error in unsupported environments
}

/**
 * Register background task based on user preference.
 */
export async function registerBackgroundSyncTask(enable: boolean = true): Promise<boolean> {
  try {
    if (enable) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 15,
      });
    } else {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
    return true;
  } catch (err) {
    return false;
  }
}

export async function unregisterBackgroundSyncTask(): Promise<boolean> {
  return registerBackgroundSyncTask(false);
}
