import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useAppLock } from '../context/AppLockContext';
import { useAppTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export function AppLockOverlay() {
  const { isAppLockEnabled, isUnlocked, isAuthenticating, securityStatus, unlockApp } = useAppLock();
  const { colors, isDark, isAmoled } = useAppTheme();
  const { signOut } = useAuth();
  const router = useRouter();

  if (!isAppLockEnabled || isUnlocked) {
    return null;
  }

  const getBiometricIcon = () => {
    switch (securityStatus?.biometricType) {
      case 'face':
        return 'scan-outline';
      case 'fingerprint':
        return 'finger-print-outline';
      case 'iris':
        return 'eye-outline';
      default:
        return 'lock-closed-outline';
    }
  };

  const getBiometricLabel = () => {
    if (securityStatus?.securityLabel && securityStatus.securityLabel !== 'No Screen Lock Set') {
      return securityStatus.securityLabel;
    }
    return 'Screen Lock (PIN / Passcode)';
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of HBS Cloud?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const bgOverlay = isDark
    ? isAmoled
      ? '#000000'
      : '#0F1117'
    : '#F8FAFC';

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayRoot, { backgroundColor: bgOverlay }]}>
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={isDark ? 80 : 60}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}

      <SafeAreaView style={styles.contentContainer} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topSpacer} />

        {/* Center Lock Presentation */}
        <View style={styles.centerContainer}>
          <View
            style={[
              styles.lockIconContainer,
              {
                backgroundColor: colors.primary + '16',
                borderColor: colors.primary + '33',
              },
            ]}
          >
            <View
              style={[
                styles.lockIconInner,
                {
                  backgroundColor: colors.primary + '28',
                },
              ]}
            >
              <Ionicons name="lock-closed" size={42} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>HBS Cloud is Locked</Text>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            Screen lock protection is active on this device
          </Text>

          <View
            style={[
              styles.securityMethodPill,
              {
                backgroundColor: isDark
                  ? isAmoled
                    ? '#111111'
                    : 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(0, 0, 0, 0.04)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              },
            ]}
          >
            <Ionicons name={getBiometricIcon() as any} size={18} color={colors.primary} />
            <Text style={[styles.securityMethodText, { color: colors.textSecondary }]}>
              {getBiometricLabel()}
            </Text>
          </View>

          {/* Primary Unlock Button */}
          <TouchableOpacity
            style={[
              styles.unlockButton,
              {
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
              },
            ]}
            onPress={() => unlockApp()}
            activeOpacity={0.8}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name={getBiometricIcon() as any} size={20} color="#FFFFFF" />
                <Text style={styles.unlockButtonText}>Unlock App</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom Options */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.subtext} />
            <Text style={[styles.signOutText, { color: colors.subtext }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 99999,
    elevation: 99999,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topSpacer: {
    height: 40,
  },
  centerContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  lockIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  lockIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  securityMethodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 28,
  },
  securityMethodText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    gap: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomContainer: {
    paddingBottom: 20,
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
