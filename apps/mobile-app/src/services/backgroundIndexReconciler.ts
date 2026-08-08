import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Battery from 'expo-battery';
import { Platform } from 'react-native';
import { backupIndexDb } from '../utils/backupIndexDb';
import { hbsApi } from './api';
import { appStorage } from '../utils/storage';

export const BACKGROUND_INDEX_RECONCILE_TASK = 'BACKGROUND_INDEX_RECONCILE_TASK';

// Register background task with TaskManager
TaskManager.defineTask(BACKGROUND_INDEX_RECONCILE_TASK, async () => {
  try {
    // 1. Check battery status if on device
    if (Platform.OS !== 'web') {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isUnplugged = batteryState !== Battery.BatteryState.CHARGING && batteryState !== Battery.BatteryState.FULL;
      if (isUnplugged && batteryLevel < 0.20) {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    }

    // 2. Load stored server config
    const serverUrl = await appStorage.getItem('hbs_server_url');
    const sessionToken = await appStorage.getItem('hbs_auth_session_token');

    if (!serverUrl) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    // 3. Fetch server files silently to update SQLite index
    const res = await hbsApi.getFiles(serverUrl, sessionToken, '', 'all');
    if (res && res.files && Array.isArray(res.files)) {
      const mapped = res.files.map((f) => ({
        name: f.name,
        size: f.size || 0,
        path: f.path,
      }));
      backupIndexDb.reconcileWithServer(mapped);
      return BackgroundTask.BackgroundTaskResult.Success;
    }
  } catch {
    // silent failure in background
  }

  return BackgroundTask.BackgroundTaskResult.Failed;
});

/**
 * Register silent background index reconciler task
 */
export async function registerBackgroundIndexReconciler(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_INDEX_RECONCILE_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_INDEX_RECONCILE_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Manually trigger silent background index reconciliation with server
 */
export async function runSilentIndexReconciliation(
  serverUrl: string,
  sessionToken: string | null
): Promise<{ count: number }> {
  try {
    const res = await hbsApi.getFiles(serverUrl, sessionToken, '', 'all');
    if (res && res.files && Array.isArray(res.files)) {
      const mapped = res.files.map((f) => ({
        name: f.name,
        size: f.size || 0,
        path: f.path,
      }));
      backupIndexDb.reconcileWithServer(mapped);
      return { count: mapped.length };
    }
  } catch {
    // ignore
  }
  return { count: 0 };
}
