import { appStorage } from '../utils/storage';
import {
  updateSyncProgressNotification,
  finishSyncNotification,
  safeNotifications,
  SYNC_NOTIFICATION_ID,
} from '../utils/safeNotifications';

export interface SyncState {
  isSyncing: boolean;
  totalToSync: number;
  syncedCount: number;
  skippedCount: number;
  currentFileName: string;
  syncStepMessage: string;
  lastSyncTimestamp?: string;
  lastUpdatedTime?: number;
}

const SYNC_STATE_KEY = 'hbs_active_sync_state_v1';

const defaultState: SyncState = {
  isSyncing: false,
  totalToSync: 0,
  syncedCount: 0,
  skippedCount: 0,
  currentFileName: '',
  syncStepMessage: '',
  lastUpdatedTime: 0,
};

let memoryState: SyncState = { ...defaultState };
const listeners = new Set<(state: SyncState) => void>();

async function shouldNotify(): Promise<boolean> {
  try {
    const raw = await appStorage.getItem('hbs_sync_config_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.showSyncNotifications === false) return false;
    }
  } catch {
    // fallback
  }
  return true;
}

export async function getStoredSyncState(): Promise<SyncState> {
  try {
    const raw = await appStorage.getItem(SYNC_STATE_KEY);
    if (raw) {
      const parsed: SyncState = JSON.parse(raw);
      // Auto-reconcile stale interrupted syncs if inactive for > 45 seconds
      if (parsed.isSyncing && parsed.lastUpdatedTime && Date.now() - parsed.lastUpdatedTime > 45000) {
        parsed.isSyncing = false;
        parsed.syncStepMessage = 'Sync paused';
      }
      memoryState = { ...parsed };
      return parsed;
    }
  } catch {
    // fallback
  }
  return memoryState;
}

export async function updateSyncState(update: Partial<SyncState>): Promise<SyncState> {
  memoryState = {
    ...memoryState,
    ...update,
    lastUpdatedTime: Date.now(),
  };

  listeners.forEach((cb) => {
    try {
      cb(memoryState);
    } catch {
      // ignore
    }
  });

  try {
    await appStorage.setItem(SYNC_STATE_KEY, JSON.stringify(memoryState));
  } catch {
    // ignore
  }

  return memoryState;
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  listener(memoryState);
  return () => {
    listeners.delete(listener);
  };
}

export const syncTracker = {
  getState: () => memoryState,
  getStoredState: getStoredSyncState,
  updateState: updateSyncState,
  subscribe: subscribeSyncState,

  startSync: async (total: number, initialMessage: string = 'Starting sync...') => {
    const state = await updateSyncState({
      isSyncing: true,
      totalToSync: total,
      syncedCount: 0,
      skippedCount: 0,
      currentFileName: '',
      syncStepMessage: initialMessage,
    });

    if (await shouldNotify()) {
      await updateSyncProgressNotification(0, total, '', initialMessage, true);
    }
    return state;
  },

  updateProgress: async (
    syncedCount: number,
    totalToSync: number,
    currentFileName: string,
    stepMessage: string,
    skippedCount?: number
  ) => {
    const state = await updateSyncState({
      isSyncing: true,
      syncedCount,
      totalToSync,
      currentFileName,
      syncStepMessage: stepMessage,
      ...(skippedCount !== undefined ? { skippedCount } : {}),
    });

    if (await shouldNotify()) {
      await updateSyncProgressNotification(syncedCount, totalToSync, currentFileName, stepMessage);
    }
    return state;
  },

  finishSync: async (successCount: number, skippedCount: number) => {
    const state = await updateSyncState({
      isSyncing: false,
      syncedCount: successCount,
      skippedCount,
      currentFileName: '',
      syncStepMessage: 'Sync complete',
      lastSyncTimestamp: new Date().toISOString(),
    });

    if (await shouldNotify()) {
      if (successCount > 0) {
        const msg = `Backed up ${successCount} item${successCount > 1 ? 's' : ''}${
          skippedCount > 0 ? ` (${skippedCount} duplicate skipped)` : ''
        }`;
        await finishSyncNotification('HBS Photo Backup Complete', msg);
      } else {
        await safeNotifications.dismissNotificationAsync(SYNC_NOTIFICATION_ID);
      }
    } else {
      await safeNotifications.dismissNotificationAsync(SYNC_NOTIFICATION_ID);
    }
    return state;
  },
};

