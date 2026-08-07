import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { safeMediaLibrary } from '../../utils/safeMediaLibrary';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi } from '../../services/api';
import { GlassCard } from '../../components/ui/GlassCard';
import { LanScannerModal } from '../../components/LanScannerModal';
import { FolderSelectorModal } from '../../components/FolderSelectorModal';
import { PermissionModal } from '../../components/PermissionModal';
import { checkFileDuplicate } from '../../utils/dedupe';
import { getAppPermissionsStatus } from '../../utils/permissions';
import { sendLocalSyncNotification } from '../../utils/safeNotifications';
import { getSyncConfig, saveSyncConfig } from '../../services/backgroundSync';
import { appStorage } from '../../utils/storage';

export default function BackupScreen() {
  const { colors, isDark } = useAppTheme();
  const { serverUrl, isConnected } = useServer();
  const { sessionToken } = useAuth();

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [wifiOnly, setWifiOnly] = useState<boolean>(true);
  const [batterySaverEnabled, setBatterySaverEnabled] = useState<boolean>(true);
  const [showSyncNotifications, setShowSyncNotifications] = useState<boolean>(true);
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);

  const [backedUpCount, setBackedUpCount] = useState<number>(0);
  const [skippedDuplicatesCount, setSkippedDuplicatesCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [totalToSync, setTotalToSync] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [syncStepMessage, setSyncStepMessage] = useState<string>('');
  const [folderTotalItems, setFolderTotalItems] = useState<number>(0);

  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionType, setPermissionType] = useState<'media' | 'notification' | 'background'>('media');

  const calculateFolderItemsCount = useCallback(async (albums: string[]) => {
    try {
      const allAlbums = await safeMediaLibrary.getAlbumsAsync();
      let total = 0;
      if (albums.length === 0) {
        total = allAlbums.reduce((sum, a) => sum + a.assetCount, 0);
      } else {
        albums.forEach((idOrTitle) => {
          const match = allAlbums.find(
            (a) => a.id === idOrTitle || a.title.toLowerCase() === idOrTitle.toLowerCase()
          );
          if (match) total += match.assetCount;
        });
      }
      setFolderTotalItems(total);
    } catch {
      setFolderTotalItems(0);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const config = await getSyncConfig();
    setAutoSyncEnabled(config.autoSyncEnabled);
    setBatterySaverEnabled(config.pauseOnLowBattery);
    setShowSyncNotifications(config.showSyncNotifications !== false);
    setSelectedAlbums(config.selectedAlbums);

    const wifiVal = await appStorage.getItem('hbs_wifi_only');
    if (wifiVal !== null) setWifiOnly(JSON.parse(wifiVal));

    await calculateFolderItemsCount(config.selectedAlbums);
  }, [calculateFolderItemsCount]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleAutoSync = async (val: boolean) => {
    if (val) {
      const perm = await getAppPermissionsStatus();
      if (!perm.mediaLibraryGranted) {
        setPermissionType('media');
        setShowPermissionModal(true);
        return;
      }
    }
    setAutoSyncEnabled(val);
    await saveSyncConfig({ autoSyncEnabled: val });
  };

  const handleToggleShowSyncNotifications = async (val: boolean) => {
    setShowSyncNotifications(val);
    await saveSyncConfig({ showSyncNotifications: val });
  };

  const handleToggleWifiOnly = async (val: boolean) => {
    setWifiOnly(val);
    await appStorage.setItem('hbs_wifi_only', JSON.stringify(val));
  };

  const handleToggleBatterySaver = async (val: boolean) => {
    setBatterySaverEnabled(val);
    await saveSyncConfig({ pauseOnLowBattery: val });
  };

  const handleFolderSave = async (albums: string[]) => {
    setSelectedAlbums(albums);
    await saveSyncConfig({ selectedAlbums: albums });
    await calculateFolderItemsCount(albums);
  };

  const handleStartAutoSync = async () => {
    if (!isConnected) {
      Alert.alert('Server Offline', 'Please connect to your HBS home server to start backup.');
      return;
    }

    const { status } = await safeMediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await safeMediaLibrary.requestPermissionsAsync();
      if (req.status !== 'granted') {
        setPermissionType('media');
        setShowPermissionModal(true);
        return;
      }
    }

    setIsSyncing(true);
    setSyncStepMessage('Scanning camera roll photos...');
    setSyncedCount(0);

    try {
      const assets = await safeMediaLibrary.getAssetsAsync({ first: 1000 });
      if (!assets || assets.length === 0) {
        Alert.alert('No Media Found', 'No photos or videos found on your device to sync.');
        setIsSyncing(false);
        return;
      }

      setTotalToSync(assets.length);
      let successCount = 0;
      let dupCount = 0;

      if (showSyncNotifications) {
        await sendLocalSyncNotification('HBS Sync Started', `Syncing ${assets.length} items to home server...`);
      }

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const fileName =
          asset.filename ||
          `sync_${Date.now()}_${i}.${asset.mediaType === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

        setCurrentFileName(fileName);
        setSyncStepMessage(`Checking deduplication (${i + 1}/${assets.length})`);

        const dupCheck = await checkFileDuplicate(
          serverUrl,
          sessionToken,
          fileName,
          asset.uri,
          undefined,
          'MobileBackup'
        );

        if (dupCheck.isDuplicate) {
          dupCount++;
          setSkippedDuplicatesCount((prev) => prev + 1);
          setSyncedCount(i + 1);
          continue;
        }

        setSyncStepMessage(`Uploading ${fileName} (${i + 1}/${assets.length})`);
        try {
          await hbsApi.uploadFile(
            serverUrl,
            sessionToken,
            asset.uri,
            fileName,
            mimeType,
            'MobileBackup'
          );
          successCount++;
        } catch {
          // continue next item
        }
        setSyncedCount(i + 1);

        // Update notification progress every 10 items
        if (showSyncNotifications && (i + 1) % 10 === 0) {
          const pct = Math.round(((i + 1) / assets.length) * 100);
          await sendLocalSyncNotification(
            'HBS Sync Progress',
            `Synced ${i + 1} / ${assets.length} items (${pct}%)`
          );
        }
      }

      setBackedUpCount((prev) => prev + successCount);
      const msg = `Synced ${successCount} new items.${
        dupCount > 0 ? ` ${dupCount} duplicate items skipped.` : ''
      }`;
      Alert.alert('Auto-Sync Complete', msg);
      if (showSyncNotifications) {
        await sendLocalSyncNotification('HBS Photo Backup Complete', msg);
      }
    } catch (e) {
      Alert.alert('Sync Error', e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
      setCurrentFileName('');
      setSyncStepMessage('');
    }
  };

  const handleStartManualBackup = async () => {
    if (!isConnected) {
      Alert.alert('Server Offline', 'Please connect to your HBS home server to start backup.');
      return;
    }

    const { status } = await safeMediaLibrary.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await safeMediaLibrary.requestPermissionsAsync();
      if (req.status !== 'granted') {
        setPermissionType('media');
        setShowPermissionModal(true);
        return;
      }
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.9,
        selectionLimit: 100,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsSyncing(true);
      setTotalToSync(result.assets.length);
      setSyncedCount(0);

      let successCount = 0;
      let dupCount = 0;

      if (showSyncNotifications) {
        await sendLocalSyncNotification('HBS Backup Started', `Uploading ${result.assets.length} selected items...`);
      }

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const fileName =
          asset.fileName ||
          `backup_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

        setCurrentFileName(fileName);
        setSyncStepMessage(`Checking deduplication (${i + 1}/${result.assets.length})`);

        const dupCheck = await checkFileDuplicate(
          serverUrl,
          sessionToken,
          fileName,
          asset.uri,
          asset.fileSize,
          'MobileBackup'
        );

        if (dupCheck.isDuplicate) {
          dupCount++;
          setSkippedDuplicatesCount((prev) => prev + 1);
          setSyncedCount(i + 1);
          continue;
        }

        setSyncStepMessage(`Uploading ${fileName} (${i + 1}/${result.assets.length})`);
        try {
          await hbsApi.uploadFile(
            serverUrl,
            sessionToken,
            asset.uri,
            fileName,
            mimeType,
            'MobileBackup'
          );
          successCount++;
        } catch {
          // continue next item
        }
        setSyncedCount(i + 1);

        if (showSyncNotifications && (i + 1) % 10 === 0) {
          const pct = Math.round(((i + 1) / result.assets.length) * 100);
          await sendLocalSyncNotification(
            'HBS Backup Progress',
            `Uploaded ${i + 1} / ${result.assets.length} items (${pct}%)`
          );
        }
      }

      setBackedUpCount((prev) => prev + successCount);

      const msg = `Uploaded ${successCount} items.${
        dupCount > 0 ? ` ${dupCount} duplicate items skipped.` : ''
      }`;

      Alert.alert('Backup Complete', msg);
      if (showSyncNotifications) {
        await sendLocalSyncNotification('HBS Photo Backup Complete', msg);
      }
    } catch (e) {
      Alert.alert('Backup Error', e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsSyncing(false);
      setCurrentFileName('');
      setSyncStepMessage('');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Backup Status Hero Glass Card */}
        <GlassCard variant="gradient" style={styles.heroCard}>
          <View style={[styles.heroIconBadge, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="cloud-upload" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>Camera Roll Auto-Sync</Text>

          <Text style={[styles.heroSub, { color: colors.subtext }]}>
            Deduplicated automatic photo and video backup directly to your private home cloud server.
          </Text>

          {isSyncing && (
            <View style={styles.syncProgressBox}>
              <View style={styles.syncProgressHeader}>
                <Text style={[styles.syncStepText, { color: colors.primary }]} numberOfLines={1}>
                  {syncStepMessage || 'Syncing in progress...'}
                </Text>
                <Text style={[styles.percentBadge, { color: colors.primary }]}>
                  {Math.round((syncedCount / (totalToSync || 1)) * 100)}%
                </Text>
              </View>

              <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.round((syncedCount / (totalToSync || 1)) * 100))}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>

              {currentFileName ? (
                <Text style={[styles.fileNameText, { color: colors.textSecondary }]} numberOfLines={1}>
                  File: {currentFileName} ({syncedCount} of {totalToSync})
                </Text>
              ) : null}
            </View>
          )}

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[
                styles.syncNowBtn,
                { flex: 1, backgroundColor: isSyncing ? colors.border : colors.primary },
              ]}
              onPress={handleStartAutoSync}
              disabled={isSyncing}
            >
              <Ionicons name="sync" size={18} color="#FFFFFF" />
              <Text style={styles.syncNowBtnText}>
                {isSyncing ? 'Syncing...' : 'Sync Folders Now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.syncNowBtn,
                {
                  flex: 1,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceVariant,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={handleStartManualBackup}
              disabled={isSyncing}
            >
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={[styles.syncNowBtnText, { color: colors.primary }]}>
                Select Photos
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Quick Stats Grid */}
        <View style={styles.statsRow}>
          <GlassCard style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {backedUpCount}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>
              Uploaded Session
            </Text>
          </GlassCard>

          <GlassCard style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>
              {skippedDuplicatesCount}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>
              Duplicates Skipped
            </Text>
          </GlassCard>

          <GlassCard style={styles.statBox}>
            <Text style={[styles.statNumber, { color: isConnected ? colors.success : colors.error }]}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>
              Server Status
            </Text>
          </GlassCard>
        </View>

        {/* Folders Selection Auto Sync Button */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Folder Management</Text>

        <TouchableOpacity onPress={() => setShowFolderModal(true)} activeOpacity={0.8}>
          <GlassCard style={styles.folderCard}>
            <LinearGradient
              colors={isDark ? ['#FACC15', '#D97706'] : ['#F59E0B', '#B45309']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardIconBadge}
            >
              <Ionicons name="folder-open" size={18} color="#FFFFFF" />
            </LinearGradient>

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[styles.folderCardTitle, { color: colors.text }]}>
                Auto-Sync Folders ({selectedAlbums.length} Selected)
              </Text>
              <Text style={[styles.folderCardSub, { color: colors.textSecondary }]}>
                {folderTotalItems > 0
                  ? `${folderTotalItems} total items ready across camera roll albums`
                  : 'Select which camera roll albums auto-sync to server'}
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

        {/* Auto Sync Settings */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sync Preferences</Text>

        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Background Auto-Sync</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Periodically sync new photos in the background even if app is closed
              </Text>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Sync Progress Notifications</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Show background sync progress & completion notifications
              </Text>
            </View>
            <Switch
              value={showSyncNotifications}
              onValueChange={handleToggleShowSyncNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Wi-Fi Only</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Only sync when connected to Wi-Fi
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={handleToggleWifiOnly}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Pause on Low Battery</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Pause sync when battery drops below 20%
              </Text>
            </View>
            <Switch
              value={batterySaverEnabled}
              onValueChange={handleToggleBatterySaver}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>

      <FolderSelectorModal
        visible={showFolderModal}
        selectedAlbums={selectedAlbums}
        onSave={handleFolderSave}
        onClose={() => setShowFolderModal(false)}
      />

      <LanScannerModal
        visible={showScannerModal}
        onClose={() => setShowScannerModal(false)}
      />

      <PermissionModal
        visible={showPermissionModal}
        type={permissionType}
        onClose={() => setShowPermissionModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  heroCard: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  syncProgressBox: {
    width: '100%',
    marginVertical: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  syncProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  syncStepText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  percentBadge: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  fileNameText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  syncNowBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 4,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
    gap: 12,
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
  folderCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  folderCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  settingsGroup: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingSub: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
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
