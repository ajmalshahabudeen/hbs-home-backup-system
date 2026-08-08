import { SafeAsset } from './safeMediaLibrary';
import { checkFileDuplicate } from './dedupe';
import { hbsApi } from '../services/api';
import { backupIndexDb } from './backupIndexDb';

export interface ParallelQueueProgress {
  total: number;
  completed: number;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  currentFileName?: string;
}

export interface ParallelQueueCallback {
  (progress: ParallelQueueProgress): void;
}

/**
 * High-performance parallel concurrency queue.
 * Uploads media assets in parallel batches using a worker pool (default concurrency: 4)
 * with fast local SQLite deduplication preflight checks.
 */
export async function runParallelUploadQueue(
  serverUrl: string,
  sessionToken: string | null,
  assets: SafeAsset[],
  concurrency: number = 4,
  parentPath: string = 'MobileBackups',
  onProgress?: ParallelQueueCallback
): Promise<{ syncedCount: number; skippedCount: number; failedCount: number }> {
  if (!assets || assets.length === 0) {
    return { syncedCount: 0, skippedCount: 0, failedCount: 0 };
  }

  let completed = 0;
  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const total = assets.length;
  let queueIndex = 0;

  const updateProgress = (lastFileName?: string) => {
    if (onProgress) {
      onProgress({
        total,
        completed,
        syncedCount,
        skippedCount,
        failedCount,
        currentFileName: lastFileName,
      });
    }
  };

  const processNextAsset = async () => {
    while (queueIndex < assets.length) {
      const i = queueIndex++;
      const asset = assets[i];
      const rawName = asset.filename ? asset.filename.split('/').pop() || asset.filename : '';
      const ext = asset.mediaType === 'video' ? 'mp4' : 'jpg';
      const fileName = rawName || `media_${asset.creationTime || Date.now()}_${i}.${ext}`;
      const mimeType = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

      // 1. Fast local SQLite duplicate preflight check
      const dupCheck = await checkFileDuplicate(
        serverUrl,
        sessionToken,
        fileName,
        asset.uri,
        undefined,
        parentPath,
        asset.creationTime
      );

      if (dupCheck.isDuplicate) {
        skippedCount++;
        completed++;
        updateProgress(fileName);
        continue;
      }

      // 2. Upload file stream
      try {
        await hbsApi.uploadFile(
          serverUrl,
          sessionToken,
          asset.uri,
          fileName,
          mimeType,
          parentPath
        );

        // Record successful upload in SQLite index
        const hash = dupCheck.fileHash || `hash_${fileName}`;
        const targetPath = parentPath ? `${parentPath}/${fileName}` : fileName;
        backupIndexDb.markAsUploaded(asset.uri, fileName, hash, 0, asset.creationTime, targetPath);

        syncedCount++;
      } catch {
        backupIndexDb.markAsFailed(asset.uri, fileName);
        failedCount++;
      }

      completed++;
      updateProgress(fileName);
    }
  };

  // Launch parallel worker pool
  const workerCount = Math.min(concurrency, assets.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(processNextAsset());
  }

  await Promise.all(workers);

  return { syncedCount, skippedCount, failedCount };
}
