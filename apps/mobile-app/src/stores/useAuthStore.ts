import { create } from 'zustand';
import { UserProfile } from '../context/AuthContext';
import { expoSecureStorage, SECURE_SESSION_KEY } from '../utils/authClient';
import { cleanSessionToken, authHeaders } from '../services/api';

interface AuthState {
  user: UserProfile | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  setUser: (user: UserProfile | null) => void;
  setSessionToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => Promise<void>;
  restoreSession: (serverUrl: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setSessionToken: (sessionToken) => set({ sessionToken }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  logout: async () => {
    set({ isLoading: true });
    try {
      await expoSecureStorage.removeItem(SECURE_SESSION_KEY);
    } finally {
      set({
        user: null,
        sessionToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  restoreSession: async (serverUrl: string) => {
    set({ isLoading: true });
    try {
      const storedToken = await expoSecureStorage.getItem(SECURE_SESSION_KEY);
      const cleanToken = cleanSessionToken(storedToken);
      if (!cleanToken || !serverUrl) {
        set({ isLoading: false, isAuthenticated: false });
        return false;
      }

      const res = await fetch(`${serverUrl}/api/auth/get-session`, {
        headers: {
          Accept: 'application/json',
          ...authHeaders(cleanToken),
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          set({
            user: data.user,
            sessionToken: cleanToken,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        }
      }
    } catch {
      // offline or error
    }

    set({ isLoading: false });
    return false;
  },
}));
