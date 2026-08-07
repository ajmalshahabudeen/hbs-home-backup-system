import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

let MediaLibraryModule: typeof import('expo-media-library') | null = null;

if (!isExpoGo) {
  try {
    MediaLibraryModule = require('expo-media-library');
  } catch (e) {
    MediaLibraryModule = null;
  }
}

export interface SafeAlbum {
  id: string;
  title: string;
  assetCount: number;
}

export const safeMediaLibrary = {
  isSupported: () => !!MediaLibraryModule,

  getPermissionsAsync: async () => {
    if (MediaLibraryModule) {
      try {
        const res = await MediaLibraryModule.getPermissionsAsync();
        return { status: res.status, granted: res.granted, canAskAgain: res.canAskAgain };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },

  requestPermissionsAsync: async () => {
    if (MediaLibraryModule) {
      try {
        const res = await MediaLibraryModule.requestPermissionsAsync();
        return { status: res.status, granted: res.granted, canAskAgain: res.canAskAgain };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },

  getAlbumsAsync: async (): Promise<SafeAlbum[]> => {
    if (MediaLibraryModule) {
      try {
        const fetchedAlbums = await MediaLibraryModule.getAlbumsAsync({ includeSmartAlbums: true });
        return fetchedAlbums
          .map((a: any) => ({
            id: String(a.id),
            title: String(a.title || 'Album'),
            assetCount: Number(a.assetCount || 0),
          }))
          .filter((a) => a.assetCount > 0);
      } catch (e) {
        // Fallback
      }
    }
    // Fallback default camera roll albums for Expo Go preview
    return [
      { id: 'camera_roll', title: 'Camera Roll', assetCount: 142 },
      { id: 'favorites', title: 'Favorites', assetCount: 28 },
      { id: 'screenshots', title: 'Screenshots', assetCount: 64 },
      { id: 'whatsapp', title: 'WhatsApp Images', assetCount: 195 },
    ];
  },
};
