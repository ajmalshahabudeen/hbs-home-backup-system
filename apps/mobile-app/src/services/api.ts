import { File, Directory, Paths, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface BackupFileItem {
  id: string;
  userId: string;
  path: string;
  name: string;
  parentPath: string;
  isDir: boolean;
  mimeType: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoMediaItem {
  id: string;
  userId: string;
  path: string;
  name: string;
  parentPath: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
  isVideo: boolean;
  url: string;
  thumbUrl?: string;
  isLocalOnly?: boolean;
  isBackedUp?: boolean;
  localUri?: string;
}

export interface UserStats {
  totalBytes: number;
  fileCount: number;
  photoCount: number;
  videoCount: number;
  docCount: number;
  otherCount: number;
  diskTotalBytes?: number;
  diskFreeBytes?: number;
  driveName?: string;
}

async function getValidToken(sessionToken: string | null): Promise<string | null> {
  if (sessionToken) return sessionToken;
  try {
    const val = await SecureStore.getItemAsync('hbs_auth_session_token');
    if (val) return val;
    return await SecureStore.getItemAsync('hbs_auth_cookie');
  } catch {
    return null;
  }
}

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `better-auth.session_token=${token}`,
  };
}

async function request<T>(
  serverUrl: string,
  sessionToken: string | null,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const activeToken = await getValidToken(sessionToken);
  Object.assign(headers, authHeaders(activeToken));

  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export const hbsApi = {
  async getFiles(
    serverUrl: string,
    sessionToken: string | null,
    path: string = '',
    category: string = 'all'
  ): Promise<{ files: BackupFileItem[]; currentPath: string }> {
    const query = new URLSearchParams();
    if (path) query.append('path', path);
    if (category) query.append('category', category);
    return request<{ files: BackupFileItem[]; currentPath: string }>(
      serverUrl,
      sessionToken,
      `/api/user/files?${query.toString()}`
    );
  },

  async getPhotos(
    serverUrl: string,
    sessionToken: string | null,
    category: string = 'all'
  ): Promise<{ media: PhotoMediaItem[] }> {
    const query = new URLSearchParams();
    if (category) query.append('category', category);
    return request<{ media: PhotoMediaItem[] }>(
      serverUrl,
      sessionToken,
      `/api/user/photos?${query.toString()}`
    );
  },

  async checkDuplicate(
    serverUrl: string,
    sessionToken: string | null,
    fileName: string,
    fileSize?: number,
    hash?: string,
    targetFilePath?: string
  ): Promise<{ isDuplicate: boolean; existingFile?: BackupFileItem }> {
    const res = await request<{
      isDuplicate?: boolean;
      duplicate?: boolean;
      existingFile?: BackupFileItem | null;
      file?: BackupFileItem | null;
    }>(serverUrl, sessionToken, '/api/user/upload/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fileName,
        fileName,
        size: fileSize,
        fileSize,
        checksum: hash,
        hash,
        path: targetFilePath,
        targetFilePath,
      }),
    });

    return {
      isDuplicate: !!(res.isDuplicate ?? res.duplicate),
      existingFile: (res.existingFile ?? res.file) || undefined,
    };
  },

  async uploadFile(
    serverUrl: string,
    sessionToken: string | null,
    fileUri: string,
    fileName: string,
    mimeType: string,
    parentPath: string = ''
  ): Promise<any> {
    const activeToken = await getValidToken(sessionToken);
    const headers: Record<string, string> = authHeaders(activeToken);

    try {
      const file = new File(fileUri);
      const result = await file.upload(`${serverUrl}/api/user/upload`, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        parameters: {
          parentPath,
          path: parentPath,
          fileName,
          name: fileName,
        },
        headers,
      });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed (${result.status}): ${result.body}`);
      }

      return JSON.parse(result.body);
    } catch (e) {
      if (Platform.OS === 'web') {
        const formData = new FormData();
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append('file', blob, fileName);
        formData.append('parentPath', parentPath);
        formData.append('path', parentPath);
        formData.append('fileName', fileName);
        formData.append('name', fileName);

        const res = await fetch(`${serverUrl}/api/user/upload`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Web Upload failed (${res.status})`);
        }
        return res.json();
      }
      throw e;
    }
  },

  async createFolder(
    serverUrl: string,
    sessionToken: string | null,
    folderName: string,
    parentPath: string = ''
  ): Promise<any> {
    return request(serverUrl, sessionToken, '/api/user/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, folderName, path: parentPath, parentPath, isDir: true }),
    });
  },

  async renameFile(
    serverUrl: string,
    sessionToken: string | null,
    path: string,
    newName: string
  ): Promise<any> {
    return request(serverUrl, sessionToken, '/api/user/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, newName }),
    });
  },

  async deleteFile(
    serverUrl: string,
    sessionToken: string | null,
    fileId: string
  ): Promise<any> {
    return request(serverUrl, sessionToken, `/api/user/files?id=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  },

  async getUserStats(
    serverUrl: string,
    sessionToken: string | null
  ): Promise<UserStats> {
    return request<UserStats>(serverUrl, sessionToken, '/api/user/stats');
  },

  async downloadFileToDevice(
    serverUrl: string,
    sessionToken: string | null,
    filePath: string,
    fileName: string
  ): Promise<string> {
    const activeToken = await getValidToken(sessionToken);
    const downloadUrl = `${serverUrl}/api/user/media/${encodeURIComponent(filePath)}?token=${encodeURIComponent(activeToken || '')}`;
    const destination = new File(Paths.document, fileName);

    const headers: Record<string, string> = authHeaders(activeToken);

    const downloadedFile = await File.downloadFileAsync(downloadUrl, destination, {
      headers,
    });

    return downloadedFile.uri;
  },
};
