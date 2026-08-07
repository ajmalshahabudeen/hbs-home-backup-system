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
}

export interface UserStats {
  totalBytes: number;
  fileCount: number;
  photoCount: number;
  videoCount: number;
  docCount: number;
  otherCount: number;
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

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
    headers['Cookie'] = `better-auth.session_token=${sessionToken}`;
  }

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
    return request<{ total: number; media: PhotoMediaItem[] }>(
      serverUrl,
      sessionToken,
      `/api/user/photos?filter=${filter}`
    );
  },

  uploadFile: async (
    serverUrl: string,
    sessionToken: string | null,
    fileUri: string,
    fileName: string,
    mimeType: string,
    parentPath: string = ''
  ): Promise<{ file: BackupFileItem }> => {
    const formData = new FormData();
    formData.append('path', parentPath);

    // React Native FormData format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);

    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
      headers['Cookie'] = `better-auth.session_token=${sessionToken}`;
    }

    const res = await fetch(`${serverUrl}/api/user/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }

    return res.json();
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

  getMediaUrl: (serverUrl: string, mediaPath: string): string => {
    return `${serverUrl}/api/user/media/${encodeURIComponent(mediaPath)}`;
  },
};
