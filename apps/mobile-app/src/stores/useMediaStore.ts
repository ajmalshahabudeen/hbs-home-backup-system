import { create } from 'zustand';
import { PhotoMediaItem } from '../services/api';
import { expoCache } from '../utils/expoCache';

const MEDIA_CACHE_KEY = 'media_gallery_cache';

interface MediaState {
  mediaList: PhotoMediaItem[];
  loading: boolean;
  hasPermission: boolean;
  columns: number;
  searchQuery: string;
  selectedCategory: string;
  
  setMediaList: (media: PhotoMediaItem[]) => void;
  setLoading: (loading: boolean) => void;
  setHasPermission: (has: boolean) => void;
  setColumns: (cols: number) => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: string) => void;
  
  loadFromCache: () => Promise<PhotoMediaItem[] | null>;
  saveToCache: (items: PhotoMediaItem[]) => Promise<void>;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  mediaList: [],
  loading: true,
  hasPermission: true,
  columns: 3,
  searchQuery: '',
  selectedCategory: 'all',

  setMediaList: (mediaList) => {
    set({ mediaList });
    get().saveToCache(mediaList);
  },

  setLoading: (loading) => set({ loading }),
  setHasPermission: (hasPermission) => set({ hasPermission }),
  setColumns: (columns) => set({ columns }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),

  loadFromCache: async () => {
    const cached = await expoCache.get<PhotoMediaItem[]>(MEDIA_CACHE_KEY);
    if (cached && cached.length > 0) {
      set({ mediaList: cached });
      return cached;
    }
    return null;
  },

  saveToCache: async (items: PhotoMediaItem[]) => {
    await expoCache.set(MEDIA_CACHE_KEY, items);
  },
}));
