import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Battery from 'expo-battery';
import { appStorage } from '../utils/storage';
import { safeNotifications } from '../utils/safeNotifications';
import { safeMediaLibrary, SafeAsset } from '../utils/safeMediaLibrary';
import { hbsApi } from './api';
import { checkFileDuplicate } from '../utils/dedupe';
import { syncTracker } from './syncTracker';

export const BACKGROUND_SYNC_TASK = 'HBS_BACKGROUND_AUTO_SYNC';

export interface SyncConfig {
  autoSyncEnabled: boolean;
  pauseOnLowBattery: boolean;
  showSyncNotifications: boolean;
  selectedAlbums: string[];
  lastSyncTimestamp?: string;
  totalSyncedCount?: number;
}

const CONFIG_STORAGE_KEY = 'hbs_sync_config_v1';

export async function getSyncConfig(): Promise<SyncConfig> {
  try {
    const raw = await appStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        autoSyncEnabled: false,
        pauseOnLowBattery: true,
        showSyncNotifications: true,
        selectedAlbums: [],
        ...parsed,
      };
    }
  } catch (e) {
    // fallback
  }
  return {
    autoSyncEnabled: false,
    pauseOnLowBattery: true,
    showSyncNotifications: true,
    selectedAlbums: [],
  };
}

export async function saveSyncConfig(config: Partial<SyncConfig>): Promise<SyncConfig> {
  const current = await getSyncConfig();
  const updated = { ...current, ...config };
  await appStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));

  if (config.autoSyncEnabled !== undefined) {
    await registerBackgroundSyncTask(config.autoSyncEnabled);
  }

  return updated;
}

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

export async function sendLocalSyncNotification(title: string, body: string) {
  try {
    const config = await getSyncConfig();
    if (config.showSyncNotifications) {
      await safeNotifications.scheduleNotificationAsync(title, body);
    }
  } catch (e) {
    // Ignore notification error
  }
}

export const sendLocalNotification = sendLocalSyncNotification;

export async function getEnabledSyncAssets(): Promise<SafeAsset[]> {
  const config = await getSyncConfig();
  if (!config.autoSyncEnabled) {
    return [];
  }
  return safeMediaLibrary.getAssetsAsync({ first: 1000 });
}

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

  const assets = await safeMediaLibrary.getAssetsAsync({ first: 1000 });
  if (!assets || assets.length === 0) {
    return { synced: 0, skipped: 0, total: 0 };
  }

  let synced = 0;
  let skipped = 0;

  await syncTracker.startSync(assets.length, 'Syncing in background...');

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const rawName = asset.filename ? asset.filename.split('/').pop() || asset.filename : '';
    const ext = asset.mediaType === 'video' ? 'mp4' : 'jpg';
    const fileName = rawName || `auto_sync_${asset.creationTime || asset.id}.${ext}`;
    const mime = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    await syncTracker.updateProgress(
      i + 1,
      assets.length,
      fileName,
      `Uploading ${fileName} (${i + 1}/${assets.length})`,
      skipped
    );

    try {
      const dup = await checkFileDuplicate(
        serverUrl,
        sessionToken,
        fileName,
        asset.uri,
        0,
        'MobileBackups',
        asset.creationTime
      );

      if (dup.isDuplicate) {
        skipped++;
        await syncTracker.updateProgress(
          i + 1,
          assets.length,
          fileName,
          `Skipped duplicate (${i + 1}/${assets.length})`,
          skipped
        );
        continue;
      }

      await hbsApi.uploadFile(
        serverUrl,
        sessionToken,
        asset.uri,
        fileName,
        mime,
        'MobileBackups',
        asset.creationTime
      );
      synced++;
    } catch {
      // continue next
    }
  }

  await syncTracker.finishSync(synced, skipped);

  await saveSyncConfig({
    lastSyncTimestamp: new Date().toISOString(),
    totalSyncedCount: (config.totalSyncedCount || 0) + synced,
  });

  return { synced, skipped, total: assets.length };
}

// Define the background task for expo-background-task
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

      const savedUrl = await appStorage.getItem('hbs_server_url');
      const savedToken = await appStorage.getItem('hbs_session_token');

      if (savedUrl) {
        await syncPhotosNow(savedUrl, savedToken);
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

export async function registerBackgroundSyncTask(enable: boolean = true): Promise<boolean> {
  try {
    if (enable) {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
          minimumInterval: 15, // minimum interval in minutes
        });
      }
    } else {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      if (isRegistered) {
        await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

export async function unregisterBackgroundSyncTask(): Promise<boolean> {
  return registerBackgroundSyncTask(false);
}
