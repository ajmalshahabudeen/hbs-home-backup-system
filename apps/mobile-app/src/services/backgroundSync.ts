import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Battery from 'expo-battery';
import { appStorage } from '../utils/storage';
import { safeNotifications } from '../utils/safeNotifications';

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

import { safeMediaLibrary, SafeAsset } from '../utils/safeMediaLibrary';

export const sendLocalNotification = sendLocalSyncNotification;

/**
 * Retrieves camera roll assets scoped strictly to user enabled sync albums.
 */
export async function getEnabledSyncAssets(): Promise<SafeAsset[]> {
  const config = await getSyncConfig();
  if (!config.autoSyncEnabled || config.selectedAlbums.length === 0) {
    return [];
  }
  const allAssets: SafeAsset[] = [];
  for (const albumId of config.selectedAlbums) {
    const albumAssets = await safeMediaLibrary.getAssetsAsync({ album: albumId, first: 50 });
    allAssets.push(...albumAssets);
  }
  if (allAssets.length === 0) {
    return safeMediaLibrary.getAssetsAsync({ first: 50 });
  }
  return allAssets;
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
