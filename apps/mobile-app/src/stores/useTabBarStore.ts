import { create } from 'zustand';

interface TabBarStore {
  isTabBarVisible: boolean;
  setTabBarVisible: (visible: boolean) => void;
}

export const useTabBarStore = create<TabBarStore>((set) => ({
  isTabBarVisible: true,
  setTabBarVisible: (visible) =>
    set((state) => (state.isTabBarVisible === visible ? state : { isTabBarVisible: visible })),
}));
