import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, UserStats } from '../../services/api';
import { LanScannerModal } from '../../components/LanScannerModal';
import { GlassCard } from '../../components/ui/GlassCard';
import { safeNotifications } from '../../utils/safeNotifications';
import {
  getAppPermissionsStatus,
  openSystemAppSettings,
  PermissionStatusSummary,
} from '../../utils/permissions';
import { appStorage } from '../../utils/storage';

export default function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode } = useAppTheme();
  const router = useRouter();
  const { serverUrl, isConnected } = useServer();
  const { user, signOut, sessionToken } = useAuth();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<PermissionStatusSummary | null>(null);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (serverUrl && isConnected) {
      hbsApi.getUserStats(serverUrl, sessionToken).then(setStats).catch(() => {});
    }
    loadPerms();
  }, [serverUrl, isConnected, sessionToken]);

  const loadPerms = async () => {
    const status = await getAppPermissionsStatus();
    setPermissions(status);

    const savedNotif = await appStorage.getItem('hbs_notifications_enabled');
    if (savedNotif !== null) setNotifEnabled(JSON.parse(savedNotif));
    else setNotifEnabled(status.notificationsGranted);
  };

  const handleToggleNotif = async (val: boolean) => {
    if (val) {
      const res = await safeNotifications.requestPermissionsAsync();
      setNotifEnabled(res.granted);
      await appStorage.setItem('hbs_notifications_enabled', JSON.stringify(res.granted));
    } else {
      setNotifEnabled(false);
      await appStorage.setItem('hbs_notifications_enabled', JSON.stringify(false));
    }
    loadPerms();
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
    if (!bytes || bytes === 0) return '0.00 MB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = (bytes / Math.pow(k, i)).toFixed(2);
    return `${val} ${sizes[i]}`;
  };

  const formattedUsedStorage = stats ? formatStorage(stats.totalBytes) : '0.00 MB';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        {user && (
          <GlassCard style={styles.profileCard} borderRadius={22}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {(user.name || user.email || 'U')[0].toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.text }]}>{user.name}</Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                {user.email}
              </Text>
              {user.role === 'admin' && (
                <View style={[styles.adminBadge, { backgroundColor: colors.primaryContainer }]}>
                  <Text style={[styles.adminText, { color: colors.primary }]}>Admin Role</Text>
                </View>
              )}
            </View>
          </GlassCard>
        )}

        {/* Cloud Storage Usage */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Cloud Storage Usage</Text>

        <GlassCard style={styles.quotaCard} borderRadius={20}>
          <View style={styles.quotaHeader}>
            <Text style={[styles.quotaTitle, { color: colors.text }]}>Storage Used</Text>
            <Text style={[styles.quotaValue, { color: colors.primary }]}>{formattedUsedStorage}</Text>
          </View>

          <View style={[styles.quotaBarBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.quotaBarFill,
                { width: '25%', backgroundColor: colors.primary },
              ]}
            />
          </View>

          <View style={styles.statsDetailsRow}>
            <View style={styles.statDetail}>
              <View style={[styles.dot, { backgroundColor: '#1A73E8' }]} />
              <Text style={[styles.statDetailText, { color: colors.textSecondary }]}>
                Photos ({stats?.photoCount || 0})
              </Text>
            </View>
            <View style={styles.statDetail}>
              <View style={[styles.dot, { backgroundColor: '#D93025' }]} />
              <Text style={[styles.statDetailText, { color: colors.textSecondary }]}>
                Videos ({stats?.videoCount || 0})
              </Text>
            </View>
            <View style={styles.statDetail}>
              <View style={[styles.dot, { backgroundColor: '#188038' }]} />
              <Text style={[styles.statDetailText, { color: colors.textSecondary }]}>
                Docs ({stats?.docCount || 0})
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* App Permissions Diagnostic Panel */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>System Permissions & Diagnostic</Text>

        <GlassCard style={styles.permCard} borderRadius={20}>
          <View style={styles.permRow}>
            <Ionicons name="images-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.text }]}>Media Library Access</Text>
              <Text style={[styles.permSub, { color: colors.textSecondary }]}>
                {permissions?.mediaLibraryGranted ? 'Granted & Active' : 'Permission Required'}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: permissions?.mediaLibraryGranted
                    ? colors.success + '20'
                    : colors.error + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: permissions?.mediaLibraryGranted ? colors.success : colors.error,
                  },
                ]}
              >
                {permissions?.mediaLibraryGranted ? 'Active' : 'Missing'}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.permRow}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.text }]}>Push Notifications</Text>
              <Text style={[styles.permSub, { color: colors.textSecondary }]}>
                Receive auto-sync completion notifications
              </Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleToggleNotif}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.permRow} onPress={openSystemAppSettings}>
            <Ionicons name="settings-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.text }]}>Open OS App Settings</Text>
              <Text style={[styles.permSub, { color: colors.textSecondary }]}>
                Manage system permissions directly in Android/iOS settings
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </GlassCard>

        {/* Appearance & Theme Selector */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance & Theme</Text>

        <View style={[styles.themeGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { key: 'light', label: 'Light Mode', icon: 'sunny-outline' },
            { key: 'dark', label: 'Dark Mode', icon: 'moon-outline' },
            { key: 'system', label: 'System Default', icon: 'phone-portrait-outline' },
          ].map((item, idx) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.themeRow,
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
              onPress={() => setThemeMode(item.key as any)}
            >
              <Ionicons name={item.icon as any} size={20} color={colors.textSecondary} />
              <Text style={[styles.themeLabel, { color: colors.text }]}>{item.label}</Text>

              {themeMode === item.key && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Server Connection Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Server Connection</Text>

        <TouchableOpacity onPress={() => setShowScannerModal(true)} activeOpacity={0.8}>
          <GlassCard style={styles.serverCard} borderRadius={20}>
            <LinearGradient
              colors={isDark ? ['#FACC15', '#D97706'] : ['#F59E0B', '#B45309']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardIconBadge}
            >
              <Ionicons name="wifi" size={18} color="#FFFFFF" />
            </LinearGradient>

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[styles.serverCardTitle, { color: colors.text }]}>
                HBS LAN Server Settings
              </Text>
              <Text style={[styles.serverCardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {serverUrl}
              </Text>
            </View>

            <View
              style={[
                styles.actionChevronBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : colors.surfaceVariant,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : colors.border,
                },
              ]}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.error + '15' }]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutBtnText, { color: colors.error }]}>Sign Out</Text>
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
    padding: 20,
    paddingBottom: 80,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  adminBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  adminText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  quotaCard: {
    marginBottom: 20,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quotaTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  quotaValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  quotaBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  quotaBarFill: {
    height: '100%',
  },
  statsDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statDetailText: {
    fontSize: 12,
  },
  permCard: {
    marginBottom: 20,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  permTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  permSub: {
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  themeGroup: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  themeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionChevronBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  serverCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 24,
    gap: 8,
    marginTop: 8,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
