import Constants, { ExecutionEnvironment } from 'expo-constants';
import { appStorage } from './storage';
import { scanDeviceStorageForMedia } from './mediaScanner';
import { yieldToUI } from './asyncTaskQueue';

let MediaLibraryModule: typeof import('expo-media-library') | null = null;
try {
  MediaLibraryModule = require('expo-media-library');
} catch (e) {
  MediaLibraryModule = null;
}

export interface SafeAlbum {
  id: string;
  title: string;
  assetCount: number;
}

export interface SafeAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video';
  creationTime: number;
  duration?: number;
  albumId?: string;
}

const IMPORTED_ASSETS_KEY = 'hbs_imported_gallery_assets';

export async function getImportedGalleryAssets(): Promise<SafeAsset[]> {
  try {
    const raw = await appStorage.getItem(IMPORTED_ASSETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveImportedGalleryAssets(newAssets: SafeAsset[]): Promise<void> {
  try {
    const existing = await getImportedGalleryAssets();
    const existingMap = new Map<string, SafeAsset>();
    existing.forEach((a) => existingMap.set(a.uri.toLowerCase(), a));
    newAssets.forEach((a) => existingMap.set(a.uri.toLowerCase(), a));
    const merged = Array.from(existingMap.values());
    await appStorage.setItem(IMPORTED_ASSETS_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export const safeMediaLibrary = {
  isSupported: () => !!MediaLibraryModule,

  getPermissionsAsync: async () => {
    if (MediaLibraryModule) {
      try {
        const res = await MediaLibraryModule.getPermissionsAsync();
        return {
          status: res.status,
          granted: res.granted,
          canAskAgain: res.canAskAgain !== false,
        };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'undetermined', granted: false, canAskAgain: true };
  },

  requestPermissionsAsync: async () => {
    if (MediaLibraryModule) {
      try {
        const res = await MediaLibraryModule.requestPermissionsAsync();
        return {
          status: res.status,
          granted: res.granted,
          canAskAgain: res.canAskAgain !== false,
        };
      } catch (e) {
        // Fallback
      }
    }
    return { status: 'undetermined', granted: false, canAskAgain: true };
  },

  getAlbumsAsync: async (): Promise<SafeAlbum[]> => {
    const albumMap = new Map<string, SafeAlbum>();

    // 1. Fetch all assets to compute exact real item counts across categories
    try {
      const allAssets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
      if (allAssets.length > 0) {
        albumMap.set('camera_roll', {
          id: 'camera_roll',
          title: 'Camera Roll (All Photos & Videos)',
          assetCount: allAssets.length,
        });

        let cameraCount = 0;
        let screenshotsCount = 0;
        let whatsappCount = 0;
        let downloadsCount = 0;

        for (const asset of allAssets) {
          const pathLower = (asset.uri || asset.filename).toLowerCase();
          if (pathLower.includes('whatsapp')) {
            whatsappCount++;
          } else if (pathLower.includes('screenshot')) {
            screenshotsCount++;
          } else if (pathLower.includes('download')) {
            downloadsCount++;
          } else {
            cameraCount++;
          }
        }

        if (cameraCount > 0) {
          albumMap.set('camera', { id: 'camera', title: 'Camera & DCIM', assetCount: cameraCount });
        }
        if (whatsappCount > 0) {
          albumMap.set('whatsapp', { id: 'whatsapp', title: 'WhatsApp Media', assetCount: whatsappCount });
        }
        if (screenshotsCount > 0) {
          albumMap.set('screenshots', { id: 'screenshots', title: 'Screenshots', assetCount: screenshotsCount });
        }
        if (downloadsCount > 0) {
          albumMap.set('downloads', { id: 'downloads', title: 'Downloads', assetCount: downloadsCount });
        }
      }
    } catch {
      // ignore
    }

    // 2. Query OS MediaStore native albums
    if (MediaLibraryModule) {
      try {
        let { granted } = await MediaLibraryModule.getPermissionsAsync();
        if (granted) {
          const fetchedAlbums = await MediaLibraryModule.getAlbumsAsync({ includeSmartAlbums: true });
          (fetchedAlbums || []).forEach((a: any) => {
            const count = Number(a.assetCount || 0);
            if (count > 0 && a.title) {
              const albumId = String(a.id);
              if (!albumMap.has(albumId)) {
                albumMap.set(albumId, {
                  id: albumId,
                  title: String(a.title),
                  assetCount: count,
                });
              }
            }
          });
        }
      } catch {
        // ignore
      }
    }

    return Array.from(albumMap.values());
  },

  getAssetsAsync: async (options?: { album?: string; first?: number; after?: string }): Promise<SafeAsset[]> => {
    const combinedMap = new Map<string, SafeAsset>();
    const maxAssetsLimit = options?.first || 50000;

    // Engine 1: Query OS MediaStore API via expo-media-library with paginated loop
    if (MediaLibraryModule) {
      try {
        let { granted } = await MediaLibraryModule.getPermissionsAsync();
        if (!granted) {
          const req = await MediaLibraryModule.requestPermissionsAsync();
          granted = req.granted;
        }

        if (granted) {
          let hasNextPage = true;
          let afterCursor: string | undefined = options?.after;

          while (hasNextPage && combinedMap.size < maxAssetsLimit) {
            const pageSize = Math.min(1000, maxAssetsLimit - combinedMap.size);
            const queryParams: any = {
              first: pageSize,
              sortBy: ['creationTime'],
            };

            if (afterCursor) {
              queryParams.after = afterCursor;
            }

            if (options?.album) {
              queryParams.album = options.album;
            }

            const res = await MediaLibraryModule.getAssetsAsync(queryParams);
            if (!res || !res.assets || !Array.isArray(res.assets) || res.assets.length === 0) {
              break;
            }

            for (const a of res.assets) {
              const item: SafeAsset = {
                id: String(a.id),
                filename: String(a.filename || `asset_${a.id}.jpg`),
                uri: String(a.uri),
                mediaType: a.mediaType === 'video' || String(a.mediaType).toLowerCase().includes('video') ? 'video' : 'photo',
                creationTime: Number(a.creationTime || Date.now()),
                duration: a.duration ? Number(a.duration) : undefined,
                albumId: a.albumId ? String(a.albumId) : undefined,
              };
              combinedMap.set(item.uri.toLowerCase(), item);
            }

            hasNextPage = !!res.hasNextPage;
            afterCursor = res.endCursor;

            // Micro-yield to JS event loop after each page read
            await yieldToUI();

            // Break if options explicitly capped page without paginating all
            if (options?.first && options.first <= 1000) {
              break;
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Engine 2: Deep scan storage directories via FileSystem ONLY if native MediaStore returned 0 assets
    if (combinedMap.size === 0) {
      await yieldToUI();
      try {
        const storageAssets = await scanDeviceStorageForMedia(maxAssetsLimit);
        for (const item of storageAssets) {
          if (!combinedMap.has(item.uri.toLowerCase())) {
            combinedMap.set(item.uri.toLowerCase(), item);
          }
        }
      } catch {
        // ignore
      }
    }

    // Engine 3: Load user-imported device gallery assets stored in appStorage
    try {
      const imported = await getImportedGalleryAssets();
      for (const item of imported) {
        if (!combinedMap.has(item.uri.toLowerCase())) {
          combinedMap.set(item.uri.toLowerCase(), item);
        }
      }
    } catch {
      // ignore
    }

    const result = Array.from(combinedMap.values());
    result.sort((a, b) => b.creationTime - a.creationTime);
    return result;
  },
};

/**
 * Filters a list of device media assets according to the user's selected album identifiers/categories.
 * Returns all assets if selectedAlbums is empty or contains 'camera_roll' / 'all'.
 */
export function filterAssetsBySelectedAlbums(
  assets: SafeAsset[],
  selectedAlbums: string[]
): SafeAsset[] {
  if (!selectedAlbums || selectedAlbums.length === 0) {
    return assets;
  }

  const lowerSelected = selectedAlbums.map((s) => s.toLowerCase());
  if (lowerSelected.includes('camera_roll') || lowerSelected.includes('all')) {
    return assets;
  }

  const selectedSet = new Set(selectedAlbums);

  return assets.filter((asset) => {
    if (asset.albumId && selectedSet.has(asset.albumId)) {
      return true;
    }

    const pathLower = (asset.uri || asset.filename || '').toLowerCase();

    if (lowerSelected.includes('whatsapp') && pathLower.includes('whatsapp')) {
      return true;
    }

    if (lowerSelected.includes('screenshots') && pathLower.includes('screenshot')) {
      return true;
    }

    if (lowerSelected.includes('downloads') && pathLower.includes('download')) {
      return true;
    }

    if (
      lowerSelected.includes('camera') &&
      !pathLower.includes('whatsapp') &&
      !pathLower.includes('screenshot') &&
      !pathLower.includes('download')
    ) {
      return true;
    }

    return false;
  });
}

