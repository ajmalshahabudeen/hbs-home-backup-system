import { Linking, Platform, Alert } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import { safeMediaLibrary } from './safeMediaLibrary';
import { safeNotifications } from './safeNotifications';

export interface PermissionStatusOverview {
  mediaLibraryGranted: boolean;
  mediaLibraryCanAskAgain: boolean;
  notificationsGranted: boolean;
  notificationsCanAskAgain: boolean;
  backgroundFetchStatus: number;
  mediaLibrary: {
    granted: boolean;
    canAskAgain: boolean;
  };
  notifications: {
    granted: boolean;
    canAskAgain: boolean;
  };
  backgroundFetch: {
    granted: boolean;
    status: number;
  };
}

export type PermissionStatusSummary = PermissionStatusOverview;

/**
 * Get comprehensive permissions status across Media, Notifications, and Background Sync.
 */
export async function getPermissionsOverview(): Promise<PermissionStatusOverview> {
  let mediaGranted = true;
  let mediaCanAskAgain = true;
  let notifGranted = true;
  let notifCanAskAgain = true;
  let bgStatus: BackgroundTask.BackgroundTaskStatus =
    BackgroundTask.BackgroundTaskStatus.Available;

  try {
    const media = await safeMediaLibrary.getPermissionsAsync();
    mediaGranted = media.granted;
    mediaCanAskAgain = media.canAskAgain;
  } catch {
    // ignore
  }

  try {
    const notifs = await safeNotifications.getPermissionsAsync();
    notifGranted = notifs.granted;
    notifCanAskAgain = notifs.canAskAgain;
  } catch {
    // ignore
  }

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== null) {
      bgStatus = status;
    }
  } catch {
    // ignore
  }

  return {
    mediaLibraryGranted: mediaGranted,
    mediaLibraryCanAskAgain: mediaCanAskAgain,
    notificationsGranted: notifGranted,
    notificationsCanAskAgain: notifCanAskAgain,
    backgroundFetchStatus: bgStatus,
    mediaLibrary: {
      granted: mediaGranted,
      canAskAgain: mediaCanAskAgain,
    },
    notifications: {
      granted: notifGranted,
      canAskAgain: notifCanAskAgain,
    },
    backgroundFetch: {
      granted: bgStatus === BackgroundTask.BackgroundTaskStatus.Available,
      status: bgStatus,
    },
  };
}

export const getAppPermissionsStatus = getPermissionsOverview;

/**
 * Open system app settings page so user can grant permissions if permanently denied.
 */
export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('app-settings:');
  } else {
    await Linking.openSettings();
  }
}

export const openSystemAppSettings = openAppSettings;

/**
 * Request Media Library access with user-friendly fallback guidance if denied.
 */
export async function requestMediaPermissionWithPrompt(): Promise<boolean> {
  const current = await safeMediaLibrary.getPermissionsAsync();
  if (current.granted) return true;

  if (!current.canAskAgain) {
    Alert.alert(
      'Media Permission Needed',
      'HBS Cloud Drive needs permission to access your photo library. Please enable it in system settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openAppSettings },
      ]
    );
    return false;
  }

  const requested = await safeMediaLibrary.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Request Notification access with user-friendly guidance.
 */
export async function requestNotificationPermissionWithPrompt(): Promise<boolean> {
  const current = await safeNotifications.getPermissionsAsync();
  if (current.granted) return true;

  if (!current.canAskAgain) {
    Alert.alert(
      'Notifications Disabled',
      'Enable notifications in your phone settings to receive auto-sync progress updates and alerts.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openAppSettings },
      ]
    );
    return false;
  }

  const requested = await safeNotifications.requestPermissionsAsync();
  return requested.granted;
}
