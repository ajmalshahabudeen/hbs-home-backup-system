import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

let NotificationsModule: typeof import('expo-notifications') | null = null;

export const SYNC_NOTIFICATION_ID = 'hbs_active_sync_progress_notification';

if (!isExpoGo) {
  try {
    NotificationsModule = require('expo-notifications');
    if (NotificationsModule && NotificationsModule.setNotificationHandler) {
      NotificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (NotificationsModule.setNotificationChannelAsync && NotificationsModule.AndroidImportance) {
        NotificationsModule.setNotificationChannelAsync('hbs-sync-progress', {
          name: 'HBS File Sync Progress',
          importance: NotificationsModule.AndroidImportance.LOW,
          sound: null,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
        });

        NotificationsModule.setNotificationChannelAsync('hbs-sync-complete', {
          name: 'HBS Backup Completion',
          importance: NotificationsModule.AndroidImportance.DEFAULT,
          sound: 'default',
          enableVibrate: true,
        });
      }
    }
  } catch (e) {
    NotificationsModule = null;
  }
}

let lastNotificationTime = 0;

export const safeNotifications = {
  isSupported: () => !!NotificationsModule,

  scheduleNotificationAsync: async (
    title: string,
    body: string,
    identifier?: string,
    channelId: string = 'hbs-sync-progress',
    playSound: boolean = false,
    sticky: boolean = false
  ) => {
    if (NotificationsModule) {
      try {
        const { granted } = await NotificationsModule.getPermissionsAsync();
        if (!granted) return;

        await NotificationsModule.scheduleNotificationAsync({
          identifier: identifier || undefined,
          content: {
            title,
            body,
            sound: playSound ? 'default' : undefined,
            sticky,
          },
          trigger: channelId ? { channelId } : null,
        });
      } catch (e) {
        // Fallback swallow for Expo Go
      }
    }
  },

  dismissNotificationAsync: async (identifier: string) => {
    if (NotificationsModule) {
      try {
        await NotificationsModule.dismissNotificationAsync(identifier);
      } catch (e) {
        // Fallback swallow
      }
    }
  },

  requestPermissionsAsync: async () => {
    if (NotificationsModule) {
      try {
        const res = await NotificationsModule.requestPermissionsAsync();
        return { status: res.status, granted: res.granted, canAskAgain: res.canAskAgain };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },

  getPermissionsAsync: async () => {
    if (NotificationsModule) {
      try {
        const res = await NotificationsModule.getPermissionsAsync();
        return { status: res.status, granted: res.granted, canAskAgain: res.canAskAgain };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },

  getExpoPushTokenAsync: async (): Promise<string | null> => {
    if (isExpoGo) return null;
    if (NotificationsModule && NotificationsModule.getExpoPushTokenAsync) {
      try {
        const { granted } = await NotificationsModule.getPermissionsAsync();
        if (!granted) {
          const req = await NotificationsModule.requestPermissionsAsync();
          if (!req.granted) return null;
        }
        const tokenData = await NotificationsModule.getExpoPushTokenAsync();
        return tokenData?.data || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  },
};

export const updateSyncProgressNotification = async (
  current: number,
  total: number,
  currentFileName?: string,
  stepMsg?: string,
  force: boolean = false
) => {
  const now = Date.now();
  if (!force && current > 1 && current < total && now - lastNotificationTime < 350) {
    return;
  }
  lastNotificationTime = now;

  if (total <= 0) return;
  const percent = Math.min(100, Math.round((current / total) * 100));
  const title = `HBS Backup (${percent}%) • ${current} of ${total}`;
  const body = currentFileName
    ? `${stepMsg || 'Uploading'} ${currentFileName}`
    : stepMsg || 'Syncing camera roll items...';

  await safeNotifications.scheduleNotificationAsync(
    title,
    body,
    SYNC_NOTIFICATION_ID,
    'hbs-sync-progress',
    false,
    true
  );
};

export const finishSyncNotification = async (title: string, body: string) => {
  await safeNotifications.dismissNotificationAsync(SYNC_NOTIFICATION_ID);
  await safeNotifications.scheduleNotificationAsync(
    title,
    body,
    'hbs_sync_complete_notification',
    'hbs-sync-complete',
    true,
    false
  );
};

export const sendLocalSyncNotification = (
  title: string,
  body: string,
  identifier?: string,
  channelId?: string,
  playSound?: boolean,
  sticky?: boolean
) => safeNotifications.scheduleNotificationAsync(title, body, identifier, channelId, playSound, sticky);


