import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useTabBarStore } from '../../stores/useTabBarStore';
import { ColorPalettes, PaletteKey } from '../../constants/theme';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useAppLock } from '../../context/AppLockContext';
import { hbsApi, UserStats } from '../../services/api';
import { LanScannerModal } from '../../components/LanScannerModal';
import { safeNotifications } from '../../utils/safeNotifications';
import {
  getAppPermissionsStatus,
  openSystemAppSettings,
  PermissionStatusSummary,
} from '../../utils/permissions';
import { appStorage } from '../../utils/storage';
import { backupIndexDb } from '../../utils/backupIndexDb';
import { expoCache } from '../../utils/expoCache';
import { runSilentIndexReconciliation } from '../../services/backgroundIndexReconciler';
import { asyncTaskQueue, yieldToInteractions } from '../../utils/asyncTaskQueue';

export default function SettingsScreen() {
  const {
    colors,
    isDark,
    isAmoled,
    amoledDark,
    themeMode,
    setThemeMode,
    paletteKey,
    setPaletteKey,
    setAmoledDark,
  } = useAppTheme();
  const setTabBarVisible = useTabBarStore((s) => s.setTabBarVisible);

  const lastScrollY = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startStopTimer = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      setTabBarVisible(true);
    }, 3000);
  }, [setTabBarVisible]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const dy = currentY - lastScrollY.current;

    if (currentY <= 10) {
      setTabBarVisible(true);
      lastScrollY.current = currentY;
      return;
    }

    if (dy > 6) {
      setTabBarVisible(false);
      startStopTimer();
    } else if (dy < -6) {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      setTabBarVisible(true);
    }

    lastScrollY.current = currentY;
  };

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const router = useRouter();
  const { serverUrl, isConnected } = useServer();
  const { user, signOut, sessionToken } = useAuth();
  const {
    isAppLockEnabled,
    securityStatus,
    enableAppLock,
    disableAppLock,
    lockApp,
  } = useAppLock();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<PermissionStatusSummary | null>(null);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);

  useEffect(() => {
    yieldToInteractions().then(() => {
      if (serverUrl && isConnected) {
        hbsApi.getUserStats(serverUrl, sessionToken).then(setStats).catch(() => {});
      }
      loadPerms();
    });
  }, [serverUrl, isConnected, sessionToken]);

  const loadPerms = async () => {
    const p = await getAppPermissionsStatus();
    setPermissions(p);
  };

  const handleToggleNotif = async (val: boolean) => {
    setNotifEnabled(val);
    if (val) {
      await safeNotifications.requestPermissionsAsync();
    }
    await appStorage.setItem('hbs_notif_enabled', JSON.stringify(val));
  };

  const handleToggleAppLock = async (val: boolean) => {
    if (val) {
      const res = await enableAppLock();
      if (!res.success) {
        if (res.reason === 'not_enrolled') {
          Alert.alert(
            'No Screen Lock Found',
            'Your device does not have a PIN, Pattern, or Biometric screen lock enabled. Please set up a screen lock in your device system settings to use App Lock.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Device Settings',
                onPress: () => openSystemAppSettings(),
              },
            ]
          );
        } else if (res.reason && res.reason !== 'Authentication cancelled or failed') {
          Alert.alert('Authentication Failed', res.reason);
        }
      }
    } else {
      const res = await disableAppLock();
      if (!res.success && res.reason && res.reason !== 'Authentication cancelled or failed') {
        Alert.alert('Authentication Failed', res.reason);
      }
    }
  };

  const getLockBiometricIcon = () => {
    switch (securityStatus?.biometricType) {
      case 'face':
        return 'scan-outline';
      case 'fingerprint':
        return 'finger-print-outline';
      case 'iris':
        return 'eye-outline';
      default:
        return 'shield-checkmark-outline';
    }
  };

  const getLockSubtitle = () => {
    if (isAppLockEnabled) {
      return `Protected by ${securityStatus?.securityLabel || 'Screen Lock'}`;
    }
    return 'Require screen lock or biometrics on launch';
  };

  const handleToggleAmoled = (val: boolean) => {
    setAmoledDark(val);
    if (val && themeMode === 'light') {
      setThemeMode('dark');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of HBS?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0.00 MB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = (bytes / Math.pow(k, i)).toFixed(2);
    return `${val} ${sizes[i]}`;
  };

  const formattedUsedStorage = stats ? formatStorage(stats.totalBytes) : '0.00 MB';
  const formattedFreeStorage = stats?.diskFreeBytes ? formatStorage(stats.diskFreeBytes) : 'Calculating...';
  const formattedTotalStorage = stats?.diskTotalBytes ? formatStorage(stats.diskTotalBytes) : '';

  const usedPercentage =
    stats?.diskTotalBytes && stats.diskTotalBytes > 0
      ? Math.min(100, Math.max(2, Math.round((stats.totalBytes / stats.diskTotalBytes) * 100)))
      : 15;

  const groupBg = isDark
    ? isAmoled
      ? '#0D0D0D'
      : 'rgba(255, 255, 255, 0.04)'
    : 'rgba(0, 0, 0, 0.025)';
  const dividerColor = isDark
    ? isAmoled
      ? '#1A1A1A'
      : 'rgba(255, 255, 255, 0.06)'
    : 'rgba(0, 0, 0, 0.05)';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        }}
        onScrollEndDrag={startStopTimer}
        onMomentumScrollEnd={startStopTimer}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.headerRow}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Profile Header */}
        {user && (
          <View style={[styles.profileHeader, { backgroundColor: groupBg }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {(user.name || user.email || 'U')[0].toUpperCase()}
              </Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                {user.name || 'HBS User'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.subtext }]} numberOfLines={1}>
                {user.email}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.profileSignoutBtn, { backgroundColor: colors.error + '14' }]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}

        {/* Cloud Storage Usage Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {stats?.driveName ? `STORAGE (${stats.driveName.toUpperCase()})` : 'STORAGE'}
          </Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.storageStatsHeader}>
            <View>
              <Text style={[styles.storageMainValue, { color: colors.text }]}>{formattedUsedStorage}</Text>
              <Text style={[styles.storageSubLabel, { color: colors.subtext }]}>
                used of {formattedTotalStorage || 'server capacity'}
              </Text>
            </View>

            <View style={[styles.storagePercentageBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.storagePercentageText, { color: colors.primary }]}>
                {usedPercentage}% Used
              </Text>
            </View>
          </View>

          <View style={[styles.storageTrack, { backgroundColor: isDark ? (isAmoled ? '#181818' : 'rgba(255,255,255,0.08)') : 'rgba(0,0,0,0.06)' }]}>
            <View
              style={[
                styles.storageFill,
                { width: `${usedPercentage}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>

          <View style={styles.storageFreeInfoRow}>
            <Text style={[styles.storageFreeText, { color: colors.subtext }]}>
              <Text style={{ color: colors.success || '#16A34A', fontWeight: '600' }}>{formattedFreeStorage}</Text> free space available
            </Text>
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor, marginLeft: 0 }]} />

          <View style={styles.mediaCountRow}>
            <View style={styles.mediaCountItem}>
              <View style={[styles.mediaDot, { backgroundColor: '#3B82F6' }]} />
              <Text style={[styles.mediaCountLabel, { color: colors.textSecondary }]}>
                Photos ({stats?.photoCount || 0})
              </Text>
            </View>
            <View style={styles.mediaCountItem}>
              <View style={[styles.mediaDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.mediaCountLabel, { color: colors.textSecondary }]}>
                Videos ({stats?.videoCount || 0})
              </Text>
            </View>
            <View style={styles.mediaCountItem}>
              <View style={[styles.mediaDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.mediaCountLabel, { color: colors.textSecondary }]}>
                Docs ({stats?.docCount || 0})
              </Text>
            </View>
          </View>
        </View>

        {/* Permissions & Diagnostics */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PERMISSIONS & DIAGNOSTICS</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="images-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Media Library Access</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                {permissions?.mediaLibraryGranted ? 'Full photo library access enabled' : 'Permission required for backup'}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: permissions?.mediaLibraryGranted
                    ? (colors.success || '#16A34A') + '18'
                    : colors.error + '18',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: permissions?.mediaLibraryGranted ? (colors.success || '#16A34A') : colors.error,
                  },
                ]}
              >
                {permissions?.mediaLibraryGranted ? 'Active' : 'Missing'}
              </Text>
            </View>
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Push Notifications</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Auto-sync & backup completion alerts
              </Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleToggleNotif}
              trackColor={{ false: isDark ? (isAmoled ? '#222222' : 'rgba(255,255,255,0.1)') : 'rgba(0,0,0,0.1)', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />

          <TouchableOpacity style={styles.itemRow} onPress={openSystemAppSettings} activeOpacity={0.7}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Open OS App Settings</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Manage permissions in system settings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        {/* Security & Privacy */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SECURITY & PRIVACY</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name={getLockBiometricIcon() as any} size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>App Lock (Screen Lock)</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                {getLockSubtitle()}
              </Text>
            </View>
            <Switch
              value={isAppLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{
                false: isDark ? (isAmoled ? '#222222' : 'rgba(255,255,255,0.1)') : 'rgba(0,0,0,0.1)',
                true: colors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>

          {isAppLockEnabled && (
            <>
              <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />
              <TouchableOpacity
                style={styles.itemRow}
                onPress={() => lockApp()}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>Lock App Now</Text>
                  <Text style={[styles.itemSub, { color: colors.subtext }]}>
                    Instantly activate screen lock
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Appearance & Theme */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
        </View>

        {/* Theme Segmented Switcher */}
        <View style={[styles.themeSegmentContainer, { backgroundColor: groupBg }]}>
          {[
            { key: 'light', label: 'Light', icon: 'sunny-outline' },
            { key: 'dark', label: 'Dark', icon: 'moon-outline' },
            { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
          ].map((item) => {
            const isSelected = themeMode === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.themeSegmentItem,
                  isSelected && [
                    styles.themeSegmentActive,
                    {
                      backgroundColor: isDark
                        ? isAmoled
                          ? '#1C1C1C'
                          : 'rgba(255, 255, 255, 0.12)'
                        : '#FFFFFF',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isDark ? 0 : 0.08,
                      shadowRadius: 4,
                      elevation: isSelected && !isDark ? 2 : 0,
                    },
                  ],
                ]}
                onPress={() => setThemeMode(item.key as any)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.icon as any}
                  size={16}
                  color={isSelected ? colors.primary : colors.subtext}
                />
                <Text
                  style={[
                    styles.themeSegmentText,
                    {
                      color: isSelected ? colors.text : colors.subtext,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* AMOLED Dark Pure Black Option */}
        <View style={[styles.groupContainer, { backgroundColor: groupBg, marginTop: 2, marginBottom: 18 }]}>
          <View style={styles.itemRow}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isAmoled
                    ? colors.primary + '18'
                    : isDark
                    ? isAmoled
                      ? '#1A1A1A'
                      : 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.04)',
                },
              ]}
            >
              <Ionicons
                name="contrast"
                size={18}
                color={isAmoled ? colors.primary : colors.subtext}
              />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>AMOLED Pure Black</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                True #000000 black canvas with vibrant color accents
              </Text>
            </View>
            <Switch
              value={amoledDark}
              onValueChange={handleToggleAmoled}
              trackColor={{
                false: isDark ? (isAmoled ? '#222222' : 'rgba(255,255,255,0.1)') : 'rgba(0,0,0,0.1)',
                true: colors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Accent Color Palette */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>COLOR ACCENT</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.paletteScrollContent}
        >
          {Object.values(ColorPalettes).map((palette) => {
            const isSelected = paletteKey === palette.id;
            return (
              <TouchableOpacity
                key={palette.id}
                style={[
                  styles.palettePill,
                  {
                    backgroundColor: isSelected ? colors.primary + '18' : groupBg,
                  },
                ]}
                onPress={() => setPaletteKey(palette.id as PaletteKey)}
                activeOpacity={0.75}
              >
                <View style={[styles.paletteDot, { backgroundColor: palette.previewColor }]}>
                  {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                </View>
                <Text
                  style={[
                    styles.paletteText,
                    {
                      color: isSelected ? colors.primary : colors.text,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {palette.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Database & Cache Management */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DATA & STORAGE</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => {
              Alert.alert(
                'Purge & Rebuild Cache & Index',
                'This will clear all local disk caches, reset your SQLite backup index, and silently rebuild the database index with your home server. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Purge & Rebuild',
                    style: 'destructive',
                    onPress: () => {
                      asyncTaskQueue.enqueue(
                        async () => {
                          backupIndexDb.purgeAllIndex();
                          await expoCache.clearAll();
                          if (serverUrl) {
                            const res = await runSilentIndexReconciliation(serverUrl, sessionToken);
                            Alert.alert('Rebuild Complete', `Index purged and rebuilt with ${res.count} items from server.`);
                          } else {
                            Alert.alert('Purge Complete', 'Local cache and SQLite index cleared.');
                          }
                        },
                        { id: 'purge_rebuild_task', priority: 'high' }
                      );
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, { backgroundColor: colors.error + '16' }]}>
              <Ionicons name="trash-bin-outline" size={18} color={colors.error} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Purge & Rebuild Index</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Clear SQLite index, reset caches & resync
              </Text>
            </View>
            <Ionicons name="refresh-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* Server Connection */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CONNECTION</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => setShowScannerModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="wifi" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>HBS LAN Server</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]} numberOfLines={1}>
                {serverUrl || 'Not Connected'}
              </Text>
            </View>
            <View style={styles.connectionStatusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isConnected ? (colors.success || '#16A34A') : colors.error },
                ]}
              />
              <Text style={[styles.connectionStatusText, { color: colors.subtext }]}>
                {isConnected ? 'Connected' : 'Offline'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Sign Out Button */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.error + '12' }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={[styles.logoutBtnText, { color: colors.error }]}>Sign Out of HBS</Text>
        </TouchableOpacity>
      </ScrollView>

      <LanScannerModal
        visible={showScannerModal}
        onClose={() => setShowScannerModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
  },
  headerRow: {
    marginBottom: 16,
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    marginBottom: 20,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  profileSignoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderRow: {
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupContainer: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 18,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
    marginVertical: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  storageStatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    marginBottom: 12,
  },
  storageMainValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  storageSubLabel: {
    fontSize: 12,
    marginTop: 1,
  },
  storagePercentageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  storagePercentageText: {
    fontSize: 12,
    fontWeight: '700',
  },
  storageTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  storageFill: {
    height: '100%',
    borderRadius: 3.5,
  },
  storageFreeInfoRow: {
    marginBottom: 10,
  },
  storageFreeText: {
    fontSize: 12,
  },
  mediaCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  mediaCountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediaDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mediaCountLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  themeSegmentContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    gap: 4,
    marginBottom: 10,
  },
  themeSegmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  themeSegmentActive: {},
  themeSegmentText: {
    fontSize: 13,
  },
  paletteScrollContent: {
    gap: 8,
    paddingBottom: 18,
  },
  palettePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 8,
  },
  paletteDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteText: {
    fontSize: 13,
  },
  connectionStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    marginTop: 6,
    marginBottom: 20,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
