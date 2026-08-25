import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { appStorage } from '../utils/storage';
import {
  getDeviceSecurityStatus,
  authenticateWithScreenLock,
  DeviceSecurityStatus,
} from '../utils/appLock';

const APP_LOCK_STORAGE_KEY = 'hbs_app_lock_enabled';

interface AppLockContextType {
  isAppLockEnabled: boolean;
  isUnlocked: boolean;
  isAuthenticating: boolean;
  securityStatus: DeviceSecurityStatus | null;
  enableAppLock: () => Promise<{ success: boolean; reason?: string }>;
  disableAppLock: () => Promise<{ success: boolean; reason?: string }>;
  lockApp: () => void;
  unlockApp: () => Promise<boolean>;
  refreshSecurityStatus: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [isAppLockEnabled, setIsAppLockEnabled] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [securityStatus, setSecurityStatus] = useState<DeviceSecurityStatus | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isAuthenticatingRef = useRef<boolean>(false);
  isAuthenticatingRef.current = isAuthenticating;

  // Refresh security status from device hardware
  const refreshSecurityStatus = useCallback(async () => {
    const status = await getDeviceSecurityStatus();
    setSecurityStatus(status);
  }, []);

  // Unlock prompt execution
  const unlockApp = useCallback(async (): Promise<boolean> => {
    if (isAuthenticatingRef.current) return false;

    try {
      setIsAuthenticating(true);
      const res = await authenticateWithScreenLock('Unlock HBS Cloud');
      if (res.success) {
        setIsUnlocked(true);
        return true;
      }
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Lock the app immediately
  const lockApp = useCallback(() => {
    setIsUnlocked(false);
  }, []);

  // Enable App Lock with screen lock verification
  const enableAppLock = useCallback(async (): Promise<{ success: boolean; reason?: string }> => {
    const status = await getDeviceSecurityStatus();
    setSecurityStatus(status);

    if (!status.isEnrolled && Platform.OS !== 'web') {
      return {
        success: false,
        reason: 'not_enrolled',
      };
    }

    try {
      setIsAuthenticating(true);
      const auth = await authenticateWithScreenLock('Verify screen lock to enable App Lock');
      if (!auth.success) {
        return {
          success: false,
          reason: auth.error || 'Authentication failed',
        };
      }

      await appStorage.setItem(APP_LOCK_STORAGE_KEY, 'true');
      setIsAppLockEnabled(true);
      setIsUnlocked(true);
      return { success: true };
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Disable App Lock with screen lock verification
  const disableAppLock = useCallback(async (): Promise<{ success: boolean; reason?: string }> => {
    try {
      setIsAuthenticating(true);
      const auth = await authenticateWithScreenLock('Verify screen lock to disable App Lock');
      if (!auth.success) {
        return {
          success: false,
          reason: auth.error || 'Authentication failed',
        };
      }

      await appStorage.setItem(APP_LOCK_STORAGE_KEY, 'false');
      setIsAppLockEnabled(false);
      setIsUnlocked(true);
      return { success: true };
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Initialize app lock state from storage
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const [savedLockVal, status] = await Promise.all([
          appStorage.getItem(APP_LOCK_STORAGE_KEY),
          getDeviceSecurityStatus(),
        ]);

        if (!isMounted) return;

        setSecurityStatus(status);
        const lockEnabled = savedLockVal === 'true';
        setIsAppLockEnabled(lockEnabled);

        if (lockEnabled) {
          setIsUnlocked(false);
        } else {
          setIsUnlocked(true);
        }
      } catch (err) {
        console.warn('[AppLockContext] Error initializing app lock:', err);
      } finally {
        if (isMounted) setIsInitialized(true);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-prompt unlock on startup if locked
  useEffect(() => {
    if (isInitialized && isAppLockEnabled && !isUnlocked && !isAuthenticating) {
      // Small timeout to allow UI / splash screen transitions to settle smoothly
      const timer = setTimeout(() => {
        unlockApp().catch(() => {});
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isAppLockEnabled, isUnlocked, unlockApp]);

  // Handle AppState changes (lock when moving to background / returning)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const prevAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (!isAppLockEnabled) return;

      // When the app goes into the background or becomes inactive
      if (
        prevAppState === 'active' &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        setIsUnlocked(false);
      }

      // When the app comes back to active from background
      if (
        (prevAppState === 'background' || prevAppState === 'inactive') &&
        nextAppState === 'active'
      ) {
        setIsUnlocked(false);
        // Automatically prompt for authentication when reopening app
        setTimeout(() => {
          unlockApp().catch(() => {});
        }, 150);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAppLockEnabled, unlockApp]);

  return (
    <AppLockContext.Provider
      value={{
        isAppLockEnabled,
        isUnlocked,
        isAuthenticating,
        securityStatus,
        enableAppLock,
        disableAppLock,
        lockApp,
        unlockApp,
        refreshSecurityStatus,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextType {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
}
