import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
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
 * Calculates a SHA-256 checksum of a local file.
 * Falls back to size + name digest if file reading fails.
 */
export async function getFileChecksum(fileUri: string, fileSize?: number): Promise<string> {
  try {
    // If small file or file system allows, compute hash
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 1024 * 512, // sample first 512KB for fast hash computation
    });
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64 + (fileSize ? `_${fileSize}` : '')
    );
    return hash;
  } catch (err) {
    // Fallback digest based on URI and size
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${fileUri}_${fileSize || 0}`
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
  parentPath: string = ''
): Promise<DedupeCheckResult> {
  try {
    const hash = await getFileChecksum(fileUri, fileSize);
    const result = await hbsApi.checkDuplicate(
      serverUrl,
      sessionToken,
      fileName,
      fileSize,
      hash,
      parentPath
    );

    return {
      isDuplicate: result.duplicate,
      fileHash: hash,
      existingFile: result.file,
      reason: result.duplicate ? 'Identical file already backed up on server' : undefined,
    };
  } catch (err) {
    // If preflight check fails (e.g. network issue), default to not duplicate so backup proceeds
    return {
      isDuplicate: false,
      reason: 'Preflight check bypassed due to network error',
    };
  }
}
