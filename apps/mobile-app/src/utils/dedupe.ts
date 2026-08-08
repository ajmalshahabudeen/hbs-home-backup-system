import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { hbsApi, BackupFileItem } from '../services/api';
import { backupIndexDb } from './backupIndexDb';
import { yieldToUI } from './asyncTaskQueue';

export interface DedupeCheckResult {
  isDuplicate: boolean;
  fileHash?: string;
  existingFile?: BackupFileItem | null;
  reason?: string;
}

export interface DedupeStats {
  checkedCount: number;
  skippedCount: number;
  uploadedCount: number;
  bytesSaved: number;
}

/**
 * Calculates a fast, memory-safe SHA-256 checksum of a local file
 * based on unique file metadata (uri + filename + creationTime + fileSize).
 * Eliminates high-memory file.text() reads that block the JS thread.
 */
export async function getFileChecksum(
  fileUri: string,
  fileName?: string,
  fileSize?: number,
  creationTime?: number
): Promise<string> {
  let size = fileSize || 0;
  try {
    if (!size) {
      const file = new File(fileUri);
      if (file.exists && file.size) {
        size = file.size;
      }
    }
  } catch {
    // ignore
  }

  const metaString = `${fileName || ''}_${size}_${creationTime || 0}_${fileUri}`;
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    metaString
  );
}

/**
 * Preflight check to determine if a local file is already backed up on HBS server.
 * Uses fast local SQLite index first before attempting network roundtrips.
 */
export async function checkFileDuplicate(
  serverUrl: string,
  sessionToken: string | null,
  fileName: string,
  fileUri: string,
  fileSize?: number,
  parentPath: string = 'MobileBackups',
  creationTime?: number
): Promise<DedupeCheckResult> {
  // 1. Fast local SQLite index preflight check (0ms network cost)
  const isLocalMatch = backupIndexDb.isLocallyUploaded(fileUri, undefined, fileName, fileSize);
  if (isLocalMatch) {
    return {
      isDuplicate: true,
      reason: 'Identical file indexed in local SQLite database',
    };
  }

  // 2. Compute file hash
  const hash = await getFileChecksum(fileUri, fileName, fileSize, creationTime);

  // Check SQLite with computed hash
  if (backupIndexDb.isLocallyUploaded(fileUri, hash, fileName, fileSize)) {
    return {
      isDuplicate: true,
      fileHash: hash,
      reason: 'Identical file hash indexed in local SQLite database',
    };
  }

  // 3. Fallback to server duplicate API
  try {
    const targetFilePath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const result = await hbsApi.checkDuplicate(
      serverUrl,
      sessionToken,
      fileName,
      fileSize,
      hash,
      targetFilePath
    );

    if (result.isDuplicate) {
      // Mark in SQLite so subsequent checks skip network
      backupIndexDb.markAsUploaded(fileUri, fileName, hash, fileSize || 0, creationTime || 0, targetFilePath);
    }

    return {
      isDuplicate: result.isDuplicate,
      fileHash: hash,
      existingFile: result.existingFile,
      reason: result.isDuplicate ? 'Identical file already backed up on server' : undefined,
    };
  } catch (err) {
    return {
      isDuplicate: false,
      reason: 'Preflight check bypassed due to network error',
    };
  }
}
