import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const SECURE_SESSION_KEY = 'hbs_auth_session_token';

export const expoSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const val = await SecureStore.getItemAsync(key);
      if (val) return val;
    } catch {
      // fallback
    }
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // fallback
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // fallback
    }
  },
};

/**
 * Creates the official Better-Auth client for Expo applications with native SecureStore session management.
 * Uses the official @better-auth/expo client plugin for zero-config session persistence and social auth.
 */
export function createHbsAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      expoClient({
        scheme: 'hbs-cloud',
        storage: SecureStore,
        storagePrefix: 'hbs_auth',
      }) as any,
    ],
  });
}

export const authClient = createHbsAuthClient('http://localhost:38480');
