import * as FileSystem from 'expo-file-system/legacy';
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
 * Scans internal and external device storage folders for photos and videos.
 */
export async function scanDeviceStorageForMedia(maxItems: number = 500): Promise<SafeAsset[]> {
  const discovered: SafeAsset[] = [];
  const seenUris = new Set<string>();

  // Add app document & cache directories
  const directoriesToScan: string[] = [...COMMON_STORAGE_PATHS];
  const docDir = (FileSystem as any).documentDirectory;
  const cacheDir = (FileSystem as any).cacheDirectory;
  if (docDir) directoriesToScan.push(docDir);
  if (cacheDir) directoriesToScan.push(cacheDir);

  for (const dirUri of directoriesToScan) {
    if (discovered.length >= maxItems) break;

    try {
      const dirInfo = await FileSystem.getInfoAsync(dirUri);
      if (!dirInfo.exists || !dirInfo.isDirectory) continue;

      const contents = await FileSystem.readDirectoryAsync(dirUri);
      for (const fileName of contents) {
        if (discovered.length >= maxItems) break;

        const lowerName = fileName.toLowerCase();
        const isImage = SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
        const isVideo = SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

        if (!isImage && !isVideo) continue;

        const fileUri = dirUri.endsWith('/') ? `${dirUri}${fileName}` : `${dirUri}/${fileName}`;

        if (seenUris.has(fileUri.toLowerCase())) continue;
        seenUris.add(fileUri.toLowerCase());

        try {
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists && !fileInfo.isDirectory) {
            const modTime = fileInfo.modificationTime
              ? fileInfo.modificationTime * 1000
              : Date.now();

            discovered.push({
              id: `storage_${fileName}_${fileInfo.size || 0}`,
              filename: fileName,
              uri: fileUri,
              mediaType: isVideo ? 'video' : 'photo',
              creationTime: modTime,
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
