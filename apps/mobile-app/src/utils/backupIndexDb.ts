import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

export interface BackupIndexRecord {
  uri: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  creationTime: number;
  status: 'uploaded' | 'pending' | 'failed';
  serverPath: string;
  updatedAt: string;
}

class BackupIndexDatabase {
  private db: SQLiteDatabase | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (Platform.OS === 'web') return;
    try {
      this.db = openDatabaseSync('hbs_backup_index.db');
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS backup_index (
          uri TEXT PRIMARY KEY NOT NULL,
          fileName TEXT NOT NULL,
          fileHash TEXT NOT NULL,
          fileSize INTEGER NOT NULL DEFAULT 0,
          creationTime INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'uploaded',
          serverPath TEXT DEFAULT '',
          updatedAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_hash ON backup_index(fileHash);
        CREATE INDEX IF NOT EXISTS idx_name_size ON backup_index(fileName, fileSize);
      `);
    } catch (e) {
      console.warn('SQLite init warning:', e);
    }
  }

  /**
   * Fast synchronous/local lookup to check if a file has already been uploaded.
   * Eliminates the need to call the server over the network during backup scans.
   */
  isLocallyUploaded(
    uri: string,
    fileHash?: string,
    fileName?: string,
    fileSize?: number
  ): boolean {
    if (!this.db) return false;
    try {
      // 1. Direct URI lookup
      const rowByUri = this.db.getFirstSync<BackupIndexRecord>(
        `SELECT status FROM backup_index WHERE uri = ? AND status = 'uploaded'`,
        [uri]
      );
      if (rowByUri) return true;

      // 2. Hash lookup
      if (fileHash) {
        const rowByHash = this.db.getFirstSync<BackupIndexRecord>(
          `SELECT status FROM backup_index WHERE fileHash = ? AND status = 'uploaded'`,
          [fileHash]
        );
        if (rowByHash) return true;
      }

      // 3. Name & Size lookup
      if (fileName && fileSize && fileSize > 0) {
        const rowByName = this.db.getFirstSync<BackupIndexRecord>(
          `SELECT status FROM backup_index WHERE fileName = ? AND fileSize = ? AND status = 'uploaded'`,
          [fileName, fileSize]
        );
        if (rowByName) return true;
      }
    } catch {
      // fallback
    }
    return false;
  }

  /**
   * Mark a file as uploaded in the local SQLite index
   */
  markAsUploaded(
    uri: string,
    fileName: string,
    fileHash: string,
    fileSize: number = 0,
    creationTime: number = 0,
    serverPath: string = ''
  ): void {
    if (!this.db) return;
    try {
      const now = new Date().toISOString();
      this.db.runSync(
        `INSERT OR REPLACE INTO backup_index 
         (uri, fileName, fileHash, fileSize, creationTime, status, serverPath, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?)`,
        [uri, fileName, fileHash, fileSize, creationTime, serverPath, now]
      );
    } catch {
      // ignore
    }
  }

  /**
   * Mark a file upload failure in the local SQLite index
   */
  markAsFailed(uri: string, fileName: string, fileHash: string = ''): void {
    if (!this.db) return;
    try {
      const now = new Date().toISOString();
      this.db.runSync(
        `INSERT OR REPLACE INTO backup_index 
         (uri, fileName, fileHash, fileSize, creationTime, status, serverPath, updatedAt)
         VALUES (?, ?, ?, 0, 0, 'failed', '', ?)`,
        [uri, fileName, fileHash, now]
      );
    } catch {
      // ignore
    }
  }

  /**
   * Reconcile local SQLite index against server file manifests.
   * Updates SQLite records to mark items present on server as uploaded.
   */
  reconcileWithServer(serverFiles: { name: string; size: number; path: string }[]): void {
    if (!this.db || !serverFiles || serverFiles.length === 0) return;
    try {
      const now = new Date().toISOString();
      for (const item of serverFiles) {
        const name = item.name;
        const size = item.size || 0;
        const mockUri = `server://${item.path}`;
        const mockHash = `srv_${name}_${size}`;

        this.db.runSync(
          `INSERT OR REPLACE INTO backup_index
           (uri, fileName, fileHash, fileSize, creationTime, status, serverPath, updatedAt)
           VALUES (?, ?, ?, ?, 0, 'uploaded', ?, ?)`,
          [mockUri, name, mockHash, size, item.path, now]
        );
      }
    } catch {
      // ignore
    }
  }

  /**
   * Purge and truncate SQLite backup index tables
   */
  purgeAllIndex(): void {
    if (!this.db) return;
    try {
      this.db.execSync(`DELETE FROM backup_index;`);
    } catch {
      // ignore
    }
  }

  /**
   * Return total count of indexed uploaded files
   */
  getUploadedCount(): number {
    if (!this.db) return 0;
    try {
      const res = this.db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) as count FROM backup_index WHERE status = 'uploaded'`
      );
      return res?.count || 0;
    } catch {
      return 0;
    }
  }
}

export const backupIndexDb = new BackupIndexDatabase();
