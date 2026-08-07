import Constants, { ExecutionEnvironment } from 'expo-constants';

// Check if running inside Expo Go client app where push notifications & certain native modules are disabled
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

let NotificationsModule: typeof import('expo-notifications') | null = null;

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
    }
  } catch (e) {
    NotificationsModule = null;
  }
}

export const safeNotifications = {
  isSupported: () => !!NotificationsModule,

  scheduleNotificationAsync: async (title: string, body: string) => {
    if (NotificationsModule) {
      try {
        const { granted } = await NotificationsModule.getPermissionsAsync();
        if (!granted) return;

        await NotificationsModule.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: true,
          },
          trigger: null,
        });
      } catch (e) {
        // Fallback swallow for Expo Go
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
};
