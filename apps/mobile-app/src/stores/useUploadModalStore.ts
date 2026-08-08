import { create } from 'zustand';

interface UploadModalStore {
  showUploadModal: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

export const useUploadModalStore = create<UploadModalStore>((set) => ({
  showUploadModal: false,
  openUploadModal: () => set({ showUploadModal: true }),
  closeUploadModal: () => set({ showUploadModal: false }),
}));
