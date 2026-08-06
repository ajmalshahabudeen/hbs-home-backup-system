import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, UserStats } from '../../services/api';
import { Header } from '../../components/Header';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function SettingsScreen() {
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const router = useRouter();
  const { serverUrl, isConnected } = useServer();
  const { user, signOut, sessionToken } = useAuth();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  useEffect(() => {
    if (serverUrl && isConnected) {
      hbsApi.getUserStats(serverUrl, sessionToken).then(setStats).catch(() => {});
    }
  }, [serverUrl, isConnected, sessionToken]);

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

  const formattedUsedGb = stats
    ? (stats.totalBytes / (1024 * 1024 * 1024)).toFixed(2)
    : '0.00';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header title="Settings" onOpenServerScanner={() => setShowScannerModal(true)} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        {user && (
          <View style={[styles.profileCard, { backgroundColor: colors.surfaceVariant }]}>
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
          </View>
        )}

        {/* Storage Quota Usage Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Cloud Storage Usage</Text>

        <View style={[styles.quotaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.quotaHeader}>
            <Text style={[styles.quotaTitle, { color: colors.text }]}>Storage Used</Text>
            <Text style={[styles.quotaValue, { color: colors.primary }]}>{formattedUsedGb} GB</Text>
          </View>

          {/* Simple Storage Bar */}
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
        </View>

        {/* Theme Settings Selector */}
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

        {/* Network & Server Settings */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Server Connection</Text>

        <TouchableOpacity
          style={[styles.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowScannerModal(true)}
        >
          <View style={[styles.serverIconBg, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="wifi" size={20} color={colors.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.serverCardTitle, { color: colors.text }]}>
              HBS LAN Server Settings
            </Text>
            <Text style={[styles.serverCardSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {serverUrl}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
    padding: 16,
    borderRadius: 20,
    gap: 14,
    marginBottom: 24,
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  quotaCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
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
  themeGroup: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 28,
  },
  serverIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverCardTitle: {
    fontSize: 15,
    fontWeight: '600',
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
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
