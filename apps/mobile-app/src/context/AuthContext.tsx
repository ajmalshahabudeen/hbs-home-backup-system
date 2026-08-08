import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useServer } from './ServerContext';
import { createHbsAuthClient } from '../utils/authClient';

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
  authClient: ReturnType<typeof createHbsAuthClient>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,
  authClient: null as any,
  signIn: async () => ({ success: false }),
  signUp: async () => ({ success: false }),
  signInWithGoogle: async () => ({ success: false }),
  signOut: async () => {},
  refreshSession: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { serverUrl, isConnected } = useServer();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize official Better-Auth SDK client instance dynamically bound to serverUrl
  const authClient = useMemo(() => {
    return createHbsAuthClient(serverUrl || 'http://localhost:38480');
  }, [serverUrl]);

  // Restore and validate session exclusively using Better-Auth getSession SDK method
  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    if (!serverUrl || !isConnected) {
      setIsLoading(false);
      return;
    }

    try {
      const res: any = await authClient.getSession();
      if (res?.data?.user) {
        setUser(res.data.user as UserProfile);
        const token = res.data.session?.token || res.data.session?.id || (authClient as any).getCookie?.();
        setSessionToken(token || null);
        setIsLoading(false);
        return;
      }
    } catch {
      // offline or unauthenticated
    }

    setUser(null);
    setSessionToken(null);
    setIsLoading(false);
  }, [serverUrl, isConnected, authClient]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Pure Better-Auth email sign-in method
  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res: any = await authClient.signIn.email({
        email,
        password,
      });

      if (res?.error) {
        setIsLoading(false);
        return { success: false, error: res.error.message || 'Sign in failed' };
      }

      if (res?.data?.user) {
        setUser(res.data.user as UserProfile);
        const token = res.data.session?.token || res.data.session?.id || (authClient as any).getCookie?.();
        setSessionToken(token || null);
        setIsLoading(false);
        return { success: true };
      }
    } catch (e) {
      setIsLoading(false);
      return { success: false, error: e instanceof Error ? e.message : 'Sign in error' };
    }

    setIsLoading(false);
    return { success: false, error: 'Sign in failed' };
  };

  // Pure Better-Auth email sign-up method
  const signUp = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res: any = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (res?.error) {
        setIsLoading(false);
        return { success: false, error: res.error.message || 'Sign up failed' };
      }

      if (res?.data?.user) {
        setUser(res.data.user as UserProfile);
        const token = res.data.session?.token || res.data.session?.id || (authClient as any).getCookie?.();
        setSessionToken(token || null);
        setIsLoading(false);
        return { success: true };
      }
    } catch (e) {
      setIsLoading(false);
      return { success: false, error: e instanceof Error ? e.message : 'Sign up error' };
    }

    setIsLoading(false);
    return { success: false, error: 'Sign up failed' };
  };

  // Pure Better-Auth social Google sign-in method
  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      const res: any = await authClient.signIn.social({
        provider: 'google',
        callbackURL: 'hbs-cloud://(auth)/login',
      });

      if (res?.error) {
        setIsLoading(false);
        return { success: false, error: res.error.message || 'Google sign in failed' };
      }

      await refreshSession();
      return { success: true };
    } catch (e) {
      setIsLoading(false);
      return { success: false, error: e instanceof Error ? e.message : 'Google auth error' };
    }
  };

  // Pure Better-Auth sign-out method
  const signOut = async () => {
    setIsLoading(true);
    try {
      await authClient.signOut();
    } finally {
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
        authClient,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
