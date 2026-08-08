import { create } from 'zustand';
import { BackupFileItem } from '../services/api';
import { expoCache } from '../utils/expoCache';

const DRIVE_CACHE_PREFIX = 'drive_path_cache_';
const INITIAL_CHUNK_SIZE = 30; // On-demand initial chunk size for ultra-fast folder opening

interface DriveState {
  files: BackupFileItem[];
  displayFiles: BackupFileItem[];
  currentPath: string;
  loading: boolean;
  viewMode: 'list' | 'grid';
  searchQuery: string;
  selectedCategory: string;
  
  // On-demand chunk pagination for 1000+ items
  chunkPage: number;
  hasMoreChunks: boolean;

  setFiles: (files: BackupFileItem[]) => void;
  setCurrentPath: (path: string) => void;
  setLoading: (loading: boolean) => void;
  setViewMode: (mode: 'list' | 'grid') => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: string) => void;
  
  loadMoreChunks: () => void;
  loadFromCache: (path: string) => Promise<BackupFileItem[] | null>;
  saveToCache: (path: string, items: BackupFileItem[]) => Promise<void>;
}

export const useDriveStore = create<DriveState>((set, get) => ({
  files: [],
  displayFiles: [],
  currentPath: '',
  loading: true,
  viewMode: 'list',
  searchQuery: '',
  selectedCategory: 'all',
  chunkPage: 1,
  hasMoreChunks: false,

  setFiles: (files) => {
    const initialChunks = files.slice(0, INITIAL_CHUNK_SIZE);
    set({
      files,
      displayFiles: initialChunks,
      chunkPage: 1,
      hasMoreChunks: files.length > INITIAL_CHUNK_SIZE,
    });
    get().saveToCache(get().currentPath, files);
  },

  setCurrentPath: (currentPath) => {
    set({ currentPath, files: [], displayFiles: [], chunkPage: 1, hasMoreChunks: false });
  },

  setLoading: (loading) => set({ loading }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),

  loadMoreChunks: () => {
    const { files, displayFiles, chunkPage, hasMoreChunks } = get();
    if (!hasMoreChunks) return;

    const nextChunkEnd = (chunkPage + 1) * INITIAL_CHUNK_SIZE;
    const nextBatch = files.slice(0, nextChunkEnd);
    set({
      displayFiles: nextBatch,
      chunkPage: chunkPage + 1,
      hasMoreChunks: files.length > nextChunkEnd,
    });
  },

  loadFromCache: async (path: string) => {
    const cacheKey = `${DRIVE_CACHE_PREFIX}${encodeURIComponent(path || 'root')}`;
    const cached = await expoCache.get<BackupFileItem[]>(cacheKey);
    if (cached && cached.length > 0) {
      get().setFiles(cached);
      return cached;
    }
    return null;
  },

  saveToCache: async (path: string, items: BackupFileItem[]) => {
    const cacheKey = `${DRIVE_CACHE_PREFIX}${encodeURIComponent(path || 'root')}`;
    await expoCache.set(cacheKey, items);
  },
}));
