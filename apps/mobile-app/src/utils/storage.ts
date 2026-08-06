import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryStore: Record<string, string> = {};

export const appStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) return val;
    } catch {
      // Native module missing or error in runtime environment
    }
    return memoryStore[key] ?? null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    memoryStore[key] = value;
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // ignore native module failure
    }
  },

  removeItem: async (key: string): Promise<void> => {
    delete memoryStore[key];
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
