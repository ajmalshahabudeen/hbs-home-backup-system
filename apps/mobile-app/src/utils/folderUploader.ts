import { File, Directory, UploadType } from 'expo-file-system';
import { hbsApi } from '../services/api';

export interface FileToUpload {
  uri: string;
  name: string;
  mimeType?: string;
  relativePath?: string; // e.g. "MyFolder/SubFolder/document.pdf"
}

export interface UploadProgressCallback {
  (current: number, total: number, fileName: string): void;
}

/**
 * Modern folder upload engine.
 * Automatically parses relative folder paths, creates required nested directory structures
 * on the server, and uploads each file into its exact target parent directory.
 */
export async function uploadFilesAndFolders(
  serverUrl: string,
  sessionToken: string | null,
  files: FileToUpload[],
  baseParentPath: string = '',
  onProgress?: UploadProgressCallback
): Promise<{ successCount: number; failCount: number }> {
  if (!files || files.length === 0) {
    return { successCount: 0, failCount: 0 };
  }

  const createdFoldersSet = new Set<string>();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    if (onProgress) {
      onProgress(i + 1, files.length, item.name);
    }

    try {
      // Determine server parent directory for this file
      let fileParentPath = baseParentPath;

      if (item.relativePath) {
        const parts = item.relativePath.split('/').filter(Boolean);
        if (parts.length > 1) {
          // Exclude filename to get relative folder chain
          const folderChain = parts.slice(0, -1);
          
          let cumulativePath = baseParentPath;
          for (const folderName of folderChain) {
            const currentFolderPath = cumulativePath
              ? `${cumulativePath}/${folderName}`
              : folderName;

            if (!createdFoldersSet.has(currentFolderPath.toLowerCase())) {
              try {
                await hbsApi.createFolder(
                  serverUrl,
                  sessionToken,
                  folderName,
                  cumulativePath
                );
              } catch {
                // Folder may already exist on server
              }
              createdFoldersSet.add(currentFolderPath.toLowerCase());
            }

            cumulativePath = currentFolderPath;
          }

          fileParentPath = cumulativePath;
        }
      }

      // Determine mime type or default to octet-stream
      const mime = item.mimeType || 'application/octet-stream';

      // Perform modern file upload
      await hbsApi.uploadFile(
        serverUrl,
        sessionToken,
        item.uri,
        item.name,
        mime,
        fileParentPath
      );

      successCount++;
    } catch (e) {
      failCount++;
    }
  }

  return { successCount, failCount };
}
