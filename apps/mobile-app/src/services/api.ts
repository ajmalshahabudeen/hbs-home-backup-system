import {
  uploadAsync,
  downloadAsync,
  FileSystemUploadType,
  documentDirectory,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { appStorage } from '../utils/storage';

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
}

async function getValidToken(sessionToken: string | null): Promise<string | null> {
  if (sessionToken) return sessionToken;
  try {
    return await appStorage.getItem('hbs_auth_token');
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

function absMediaUrl(serverUrl: string, urlOrPath: string, token: string | null): string {
  if (!urlOrPath) return '';
  if (
    urlOrPath.startsWith('http://') ||
    urlOrPath.startsWith('https://') ||
    urlOrPath.startsWith('file:')
  ) {
    // ensure token present
    if (token && urlOrPath.startsWith(serverUrl) && !urlOrPath.includes('token=')) {
      const sep = urlOrPath.includes('?') ? '&' : '?';
      return `${urlOrPath}${sep}token=${encodeURIComponent(token)}`;
    }
    return urlOrPath;
  }
  let path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  if (token && !path.includes('token=')) {
    const sep = path.includes('?') ? '&' : '?';
    path = `${path}${sep}token=${encodeURIComponent(token)}`;
  }
  return `${serverUrl}${path}`;
}

export const hbsApi = {
  getFiles: async (
    serverUrl: string,
    sessionToken: string | null,
    parentPath: string = '',
    category: string = 'all',
    search: string = ''
  ): Promise<{ files: BackupFileItem[]; path: string }> => {
    const query = new URLSearchParams();
    if (parentPath) query.set('path', parentPath);
    if (category && category !== 'all') query.set('category', category);
    if (search) query.set('search', search);

    const qStr = query.toString();
    return request<{ files: BackupFileItem[]; path: string }>(
      serverUrl,
      sessionToken,
      `/api/user/files${qStr ? `?${qStr}` : ''}`
    );
  },

  createFolder: async (
    serverUrl: string,
    sessionToken: string | null,
    name: string,
    parentPath: string = ''
  ): Promise<{ file: BackupFileItem }> => {
    return request<{ file: BackupFileItem }>(
      serverUrl,
      sessionToken,
      '/api/user/files',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: parentPath, isDir: true }),
      }
    );
  },

  renameFile: async (
    serverUrl: string,
    sessionToken: string | null,
    id: string,
    newName: string
  ): Promise<{ file: BackupFileItem }> => {
    return request<{ file: BackupFileItem }>(
      serverUrl,
      sessionToken,
      '/api/user/files',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: newName }),
      }
    );
  },

  deleteFile: async (
    serverUrl: string,
    sessionToken: string | null,
    id: string
  ): Promise<{ deleted: boolean }> => {
    return request<{ deleted: boolean }>(
      serverUrl,
      sessionToken,
      `/api/user/files?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },

  getPhotos: async (
    serverUrl: string,
    sessionToken: string | null,
    filter: 'all' | 'photos' | 'videos' = 'all'
  ): Promise<{ total: number; media: PhotoMediaItem[] }> => {
    const res = await request<{ total: number; media: PhotoMediaItem[] }>(
      serverUrl,
      sessionToken,
      `/api/user/photos?filter=${filter}`
    );
    const token = await getValidToken(sessionToken);
    return {
      total: res.total,
      media: (res.media || []).map((m) => ({
        ...m,
        url: absMediaUrl(serverUrl, m.url, token),
        thumbUrl: absMediaUrl(
          serverUrl,
          m.thumbUrl ||
            (m.path
              ? `/api/user/media/${m.path
                  .split('/')
                  .map((p) => encodeURIComponent(p))
                  .join('/')}?thumb=1`
              : m.url),
          token
        ),
      })),
    };
  },

  uploadFile: async (
    serverUrl: string,
    sessionToken: string | null,
    fileUri: string,
    fileName: string,
    mimeType: string,
    parentPath: string = ''
  ): Promise<{ file: BackupFileItem }> => {
    const activeToken = await getValidToken(sessionToken);
    if (!activeToken) {
      throw new Error('Not authenticated — please sign in again');
    }
    const headers = authHeaders(activeToken);

    // Prefer FormData fetch first — more reliable auth header handling on RN
    // than expo-file-system uploadAsync (which often drops cookies).
    const tryFetchUpload = async (): Promise<{ file: BackupFileItem }> => {
      const formData = new FormData();
      formData.append('path', parentPath);
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType || 'application/octet-stream',
      } as any);

      const res = await fetch(`${serverUrl}/api/user/upload`, {
        method: 'POST',
        headers: {
          ...headers,
          Accept: 'application/json',
          // Do NOT set Content-Type — RN sets multipart boundary
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      return res.json();
    };

    try {
      return await tryFetchUpload();
    } catch (fetchErr) {
      // Fallback to uploadAsync (some Android versions prefer it for large files)
      try {
        const uploadRes = await uploadAsync(
          `${serverUrl}/api/user/upload`,
          fileUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            parameters: {
              path: parentPath,
            },
            headers: {
              ...headers,
              Accept: 'application/json',
            },
          }
        );

        if (uploadRes.status >= 200 && uploadRes.status < 300) {
          return JSON.parse(uploadRes.body);
        }
        const errJson = JSON.parse(uploadRes.body || '{}');
        throw new Error(errJson.error || `Upload failed (${uploadRes.status})`);
      } catch {
        throw fetchErr instanceof Error
          ? fetchErr
          : new Error('Upload failed');
      }
    }
  },

  downloadFileToDevice: async (
    serverUrl: string,
    sessionToken: string | null,
    fileRelPath: string,
    fileName: string
  ): Promise<string> => {
    const targetUri = `${documentDirectory || ''}${fileName}`;
    const activeToken = await getValidToken(sessionToken);
    const headers = authHeaders(activeToken);

    const downloadRes = await downloadAsync(
      hbsApi.getMediaUrl(serverUrl, fileRelPath, activeToken),
      targetUri,
      { headers }
    );
    return downloadRes.uri;
  },

  getUserStats: async (
    serverUrl: string,
    sessionToken: string | null
  ): Promise<UserStats> => {
    return request<UserStats>(serverUrl, sessionToken, '/api/user/stats');
  },

  checkDuplicate: async (
    serverUrl: string,
    sessionToken: string | null,
    fileName: string,
    size?: number,
    checksum?: string,
    parentPath: string = ''
  ): Promise<{ duplicate: boolean; file: BackupFileItem | null }> => {
    return request<{ duplicate: boolean; file: BackupFileItem | null }>(
      serverUrl,
      sessionToken,
      '/api/user/upload/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileName, size, checksum, path: parentPath }),
      }
    );
  },

  getMediaUrl: (
    serverUrl: string,
    mediaPath: string,
    token?: string | null
  ): string => {
    const enc = mediaPath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    const base = `${serverUrl}/api/user/media/${enc}`;
    if (token) return `${base}?token=${encodeURIComponent(token)}`;
    return base;
  },

  getThumbUrl: (
    serverUrl: string,
    mediaPath: string,
    token?: string | null
  ): string => {
    const enc = mediaPath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    const base = `${serverUrl}/api/user/media/${enc}`;
    if (token) return `${base}?token=${encodeURIComponent(token)}&thumb=1`;
    return `${base}?thumb=1`;
  },

  authHeaders,
};
