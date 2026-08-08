import { File, Directory, Paths } from 'expo-file-system';
import { SafeAsset } from './safeMediaLibrary';

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.bmp'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.3gp'];

// Common Android & iOS storage directory paths
const COMMON_STORAGE_PATHS = [
  'file:///storage/emulated/0/DCIM',
  'file:///storage/emulated/0/DCIM/Camera',
  'file:///storage/emulated/0/Pictures',
  'file:///storage/emulated/0/Pictures/Screenshots',
  'file:///storage/emulated/0/Download',
  'file:///storage/emulated/0/Movies',
  'file:///storage/emulated/0/WhatsApp/Media/WhatsApp Images',
  'file:///storage/emulated/0/WhatsApp/Media/WhatsApp Video',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images',
  'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video',
];

/**
 * Scans internal and external device storage folders for photos and videos
 * using modern Expo SDK 57 Directory & File API.
 */
export async function scanDeviceStorageForMedia(maxItems: number = 10000): Promise<SafeAsset[]> {
  const discovered: SafeAsset[] = [];
  const seenUris = new Set<string>();

  const directoriesToScan: string[] = [...COMMON_STORAGE_PATHS];
  if (Paths.document?.uri) directoriesToScan.push(Paths.document.uri);
  if (Paths.cache?.uri) directoriesToScan.push(Paths.cache.uri);

  for (const dirUri of directoriesToScan) {
    if (discovered.length >= maxItems) break;

    try {
      const dir = new Directory(dirUri);
      if (!dir.exists) continue;

      const contents = dir.list();
      for (const item of contents) {
        if (discovered.length >= maxItems) break;
        if (item instanceof Directory) continue;

        const file = item as File;
        const lowerName = file.name.toLowerCase();
        const isImage = SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
        const isVideo = SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

        if (!isImage && !isVideo) continue;

        if (seenUris.has(file.uri.toLowerCase())) continue;
        seenUris.add(file.uri.toLowerCase());

        try {
          if (file.exists) {
            discovered.push({
              id: `storage_${file.name}_${file.size || 0}`,
              filename: file.name,
              uri: file.uri,
              mediaType: isVideo ? 'video' : 'photo',
              creationTime: Date.now(),
            });
          }
        } catch {
          // continue
        }
      }
    } catch {
      // Directory inaccessible or missing permissions
    }
  }

  return discovered;
}
