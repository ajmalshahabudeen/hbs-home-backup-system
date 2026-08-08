"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewMode = "table" | "grid";
export type SortDir = "asc" | "desc";

export interface FilesPreferenceState {
  selectedUserId: string;
  currentPath: string;
  pageSize: number;
  viewMode: ViewMode;
  sortKey: string | null;
  sortDir: SortDir;
  setSelectedUserId: (userId: string) => void;
  setCurrentPath: (path: string) => void;
  setPageSize: (size: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSort: (key: string | null, dir?: SortDir) => void;
  resetPreferences: () => void;
}

const DEFAULT_STATE = {
  selectedUserId: "",
  currentPath: "",
  pageSize: 25,
  viewMode: "table" as ViewMode,
  sortKey: null as string | null,
  sortDir: "asc" as SortDir,
};

export const useFilesStore = create<FilesPreferenceState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setSelectedUserId: (selectedUserId) => set({ selectedUserId }),

      setCurrentPath: (currentPath) => set({ currentPath }),

      setPageSize: (pageSize) => set({ pageSize }),

      setViewMode: (viewMode) => set({ viewMode }),

      setSort: (sortKey, dir) => {
        if (dir) {
          set({ sortKey, sortDir: dir });
        } else {
          const currentKey = get().sortKey;
          const currentDir = get().sortDir;
          if (currentKey === sortKey) {
            set({ sortDir: currentDir === "asc" ? "desc" : "asc" });
          } else {
            set({ sortKey, sortDir: "asc" });
          }
        }
      },

      resetPreferences: () => set(DEFAULT_STATE),
    }),
    {
      name: "hbs_files_dashboard_preferences_v2",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
    }
  )
);
