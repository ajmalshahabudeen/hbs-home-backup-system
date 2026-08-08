import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { hbsApi, BackupFileItem } from '../services/api';

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
 * Calculates a SHA-256 checksum of a local file using modern Expo SDK 57 File API
 * based on unique file attributes (filename + creationTime + fileSize + content sample).
 */
export async function getFileChecksum(
  fileUri: string,
  fileName?: string,
  fileSize?: number,
  creationTime?: number
): Promise<string> {
  const metaString = `${fileName || ''}_${fileSize || 0}_${creationTime || 0}`;
  try {
    const file = new File(fileUri);
    let sample = '';
    if (file.exists) {
      const text = await file.text();
      sample = text.slice(0, 1024 * 64);
    }
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${metaString}_${sample}`
    );
  } catch (err) {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${metaString}_${fileUri}`
    );
  }
}

/**
 * Preflight check to determine if a local file is already backed up on HBS server.
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
  try {
    const hash = await getFileChecksum(fileUri, fileName, fileSize, creationTime);
    const targetFilePath = parentPath ? `${parentPath}/${fileName}` : fileName;

    const result = await hbsApi.checkDuplicate(
      serverUrl,
      sessionToken,
      fileName,
      fileSize,
      hash,
      targetFilePath
    );

    return {
      isDuplicate: result.isDuplicate,
      fileHash: hash,
      existingFile: result.existingFile,
      reason: result.isDuplicate ? 'Identical file already backed up on server' : undefined,
    };
  } catch (err) {
    // If preflight check fails (e.g. network issue), default to not duplicate so backup proceeds
    return {
      isDuplicate: false,
      reason: 'Preflight check bypassed due to network error',
    };
  }
}
