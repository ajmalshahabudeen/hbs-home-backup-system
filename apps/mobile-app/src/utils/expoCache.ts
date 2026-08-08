import * as FileSystem from 'expo-file-system';
import { appStorage } from './storage';

const CACHE_KEY_PREFIX = 'hbs_expo_cache_';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours default TTL

export interface CachedData<T> {
  timestamp: number;
  data: T;
}

/**
 * High-performance Expo caching layer.
 * Combines memory cache, persistent appStorage, and FileSystem disk caching.
 */
class ExpoCacheManager {
  private memoryCache = new Map<string, CachedData<any>>();

  private getCacheDirectory(): string | null {
    const fsAny = FileSystem as any;
    return fsAny.cacheDirectory || fsAny.Paths?.cache?.uri || null;
  }

  /**
   * Set cached items in memory and persistent storage
   */
  async set<T>(key: string, data: T): Promise<void> {
    const cacheEntry: CachedData<T> = {
      timestamp: Date.now(),
      data,
    };

    // 1. Memory cache
    this.memoryCache.set(key, cacheEntry);

    // 2. Persistent AsyncStorage/appStorage cache
    try {
      await appStorage.setItem(`${CACHE_KEY_PREFIX}${key}`, JSON.stringify(cacheEntry));
    } catch {
      // ignore storage errors
    }

    // 3. Optional disk file cache in FileSystem cacheDirectory for heavy payloads
    try {
      const cacheDir = this.getCacheDirectory();
      if (cacheDir) {
        const fileUri = `${cacheDir}hbs_cache_${encodeURIComponent(key)}.json`;
        await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(cacheEntry), {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
    } catch {
      // ignore file system cache errors
    }
  }

  /**
   * Get cached item if present (returns null if missing or expired)
   */
  async get<T>(key: string, maxAgeMs: number = CACHE_TTL_MS): Promise<T | null> {
    const now = Date.now();

    // 1. Check memory cache first
    const memItem = this.memoryCache.get(key);
    if (memItem) {
      if (now - memItem.timestamp <= maxAgeMs) {
        return memItem.data as T;
      }
    }

    // 2. Check appStorage
    try {
      const raw = await appStorage.getItem(`${CACHE_KEY_PREFIX}${key}`);
      if (raw) {
        const parsed: CachedData<T> = JSON.parse(raw);
        if (now - parsed.timestamp <= maxAgeMs) {
          this.memoryCache.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {
      // fallback to disk
    }

    // 3. Check FileSystem cacheDirectory
    try {
      const cacheDir = this.getCacheDirectory();
      if (cacheDir) {
        const fileUri = `${cacheDir}hbs_cache_${encodeURIComponent(key)}.json`;
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists) {
          const rawDisk = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const parsedDisk: CachedData<T> = JSON.parse(rawDisk);
          if (now - parsedDisk.timestamp <= maxAgeMs) {
            this.memoryCache.set(key, parsedDisk);
            return parsedDisk.data;
          }
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Clear cache item
   */
  async remove(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await appStorage.removeItem(`${CACHE_KEY_PREFIX}${key}`).catch(() => {});
    try {
      const cacheDir = this.getCacheDirectory();
      if (cacheDir) {
        const fileUri = `${cacheDir}hbs_cache_${encodeURIComponent(key)}.json`;
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Clear all app caches
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
  }
}

export const expoCache = new ExpoCacheManager();
