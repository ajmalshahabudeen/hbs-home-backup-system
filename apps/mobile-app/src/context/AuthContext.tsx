import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { appStorage } from '../utils/storage';
import { useServer } from './ServerContext';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  image?: string | null;
}

interface AuthContextType {
  user: UserProfile | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'hbs_auth_token';

const AuthContext = createContext<AuthContextType>({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,
  signIn: async () => ({ success: false }),
  signUp: async () => ({ success: false }),
  signOut: async () => {},
  refreshSession: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { serverUrl, isConnected } = useServer();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const restoreSession = useCallback(async () => {
    if (!serverUrl || !isConnected) {
      setIsLoading(false);
      return;
    }

    try {
      const storedToken = await appStorage.getItem(AUTH_STORAGE_KEY);
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['Cookie'] = `better-auth.session_token=${storedToken}`;
      }

      const res = await fetch(`${serverUrl}/api/auth/get-session`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          if (storedToken) setSessionToken(storedToken);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // offline or session expired
    }
    setUser(null);
    setIsLoading(false);
  }, [serverUrl, isConnected]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return { success: false, error: data.message || data.error || 'Sign in failed' };
      }

      const returnedToken = data.token || data.session?.token;
      if (returnedToken) {
        await appStorage.setItem(AUTH_STORAGE_KEY, returnedToken);
        setSessionToken(returnedToken);
      }

      setUser(data.user || data.session?.user || { id: 'user_1', email, name: email.split('@')[0] });
      setIsLoading(false);
      return { success: true };
    } catch (e) {
      setIsLoading(false);
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return { success: false, error: data.message || data.error || 'Sign up failed' };
      }

      const returnedToken = data.token || data.session?.token;
      if (returnedToken) {
        await appStorage.setItem(AUTH_STORAGE_KEY, returnedToken);
        setSessionToken(returnedToken);
      }

      setUser(data.user || data.session?.user || { id: 'user_new', email, name });
      setIsLoading(false);
      return { success: true };
    } catch (e) {
      setIsLoading(false);
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      if (serverUrl && sessionToken) {
        await fetch(`${serverUrl}/api/auth/sign-out`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            Cookie: `better-auth.session_token=${sessionToken}`,
          },
        }).catch(() => {});
      }
    } finally {
      await appStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
      setUser(null);
      setSessionToken(null);
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionToken,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshSession: restoreSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
