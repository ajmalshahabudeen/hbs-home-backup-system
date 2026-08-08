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
import { runParallelUploadQueue } from '../../utils/parallelUploadQueue';
import { getAppPermissionsStatus } from '../../utils/permissions';
import { sendLocalSyncNotification } from '../../utils/safeNotifications';
import { getSyncConfig, saveSyncConfig } from '../../services/backgroundSync';
import { syncTracker, SyncState } from '../../services/syncTracker';
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
  const [syncState, setSyncState] = useState<SyncState>(syncTracker.getState());
  const [folderTotalItems, setFolderTotalItems] = useState<number>(0);

  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionType, setPermissionType] = useState<'media' | 'notification' | 'background'>('media');

  useEffect(() => {
    syncTracker.getStoredState().then((st) => setSyncState(st));
    const unsubscribe = syncTracker.subscribe((st) => {
      setSyncState(st);
    });
    return unsubscribe;
  }, []);

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

    try {
      const assets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
      if (!assets || assets.length === 0) {
        Alert.alert('No Media Found', 'No photos or videos found on your device to sync.');
        return;
      }

      await syncTracker.startSync(assets.length, 'Scanning camera roll photos...');

      const result = await runParallelUploadQueue(
        serverUrl,
        sessionToken,
        assets,
        4,
        'MobileBackups',
        (progress) => {
          syncTracker.updateProgress(
            progress.completed,
            progress.total,
            progress.currentFileName || 'Processing...',
            `Uploading ${progress.completed}/${progress.total} (${progress.syncedCount} new, ${progress.skippedCount} skipped)`,
            progress.skippedCount
          );
        }
      );

      await syncTracker.finishSync(result.syncedCount, result.skippedCount);
      setBackedUpCount((prev) => prev + result.syncedCount);
      const msg = `Synced ${result.syncedCount} new items.${
        result.skippedCount > 0 ? ` ${result.skippedCount} duplicate items skipped via fast SQLite index.` : ''
      }`;
      Alert.alert('Auto-Sync Complete', msg);
    } catch (e) {
      await syncTracker.finishSync(0, 0);
      Alert.alert('Sync Error', e instanceof Error ? e.message : 'Sync failed');
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

      await syncTracker.startSync(result.assets.length, 'Starting manual upload...');
      let successCount = 0;
      let dupCount = 0;

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const rawName = asset.fileName ? asset.fileName.split('/').pop() || asset.fileName : '';
        const ext = asset.type === 'video' ? 'mp4' : 'jpg';
        const fileName = rawName || `manual_${Date.now()}_${i}.${ext}`;
        const mimeType =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

        await syncTracker.updateProgress(
          i,
          result.assets.length,
          fileName,
          `Checking deduplication (${i + 1}/${result.assets.length})`,
          dupCount
        );

        const dupCheck = await checkFileDuplicate(
          serverUrl,
          sessionToken,
          fileName,
          asset.uri,
          asset.fileSize,
          'MobileBackups'
        );

        if (dupCheck.isDuplicate) {
          dupCount++;
          await syncTracker.updateProgress(
            i + 1,
            result.assets.length,
            fileName,
            `Skipped duplicate (${i + 1}/${result.assets.length})`,
            dupCount
          );
          continue;
        }

        await syncTracker.updateProgress(
          i + 1,
          result.assets.length,
          fileName,
          `Uploading ${fileName} (${i + 1}/${result.assets.length})`,
          dupCount
        );

        try {
          await hbsApi.uploadFile(
            serverUrl,
            sessionToken,
            asset.uri,
            fileName,
            mimeType,
            'MobileBackups'
          );
          successCount++;
        } catch {
          // continue next item
        }
      }

      await syncTracker.finishSync(successCount, dupCount);
      setBackedUpCount((prev) => prev + successCount);

      const msg = `Uploaded ${successCount} items.${
        dupCount > 0 ? ` ${dupCount} duplicate items skipped.` : ''
      }`;

      Alert.alert('Backup Complete', msg);
    } catch (e) {
      await syncTracker.finishSync(0, 0);
      Alert.alert('Backup Error', e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const isSyncing = syncState.isSyncing;
  const syncedCount = syncState.syncedCount;
  const totalToSync = syncState.totalToSync;
  const currentFileName = syncState.currentFileName;
  const syncStepMessage = syncState.syncStepMessage;
  const skippedDuplicatesCount = syncState.skippedCount;

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
            <View style={styles.folderCardHeader}>
              <View style={[styles.folderIconBg, { backgroundColor: colors.primaryContainer }]}>
                <Ionicons name="folder-open" size={24} color={colors.primary} />
              </View>
              <View style={styles.folderCardTitleBox}>
                <Text style={[styles.folderCardTitle, { color: colors.text }]}>
                  {selectedAlbums.length === 0 ? 'All Device Albums Selected' : `${selectedAlbums.length} Albums Selected`}
                </Text>
                <Text style={[styles.folderCardSub, { color: colors.subtext }]}>
                  {folderTotalItems > 0 ? `${folderTotalItems} total items ready for sync` : 'Tap to customize synced folders'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Server Connection Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Backup Target</Text>

        <GlassCard style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Home Backup Server</Text>
              <Text style={[styles.settingDesc, { color: colors.subtext }]}>
                {isConnected && serverUrl ? serverUrl : 'No server connected. Connect on home Wi-Fi.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, { backgroundColor: isConnected ? colors.surfaceVariant : colors.primary }]}
              onPress={() => setShowScannerModal(true)}
            >
              <Text style={[styles.connectBtnText, { color: isConnected ? colors.primary : '#FFFFFF' }]}>
                {isConnected ? 'Change' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Preferences */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sync Preferences</Text>

        <GlassCard style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Background Auto-Sync</Text>
              <Text style={[styles.settingDesc, { color: colors.subtext }]}>
                Automatically upload new camera roll photos and videos
              </Text>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Sync Progress Notifications</Text>
              <Text style={[styles.settingDesc, { color: colors.subtext }]}>
                Show background sync notifications & percentage progress
              </Text>
            </View>
            <Switch
              value={showSyncNotifications}
              onValueChange={handleToggleShowSyncNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Wi-Fi Only Sync</Text>
              <Text style={[styles.settingDesc, { color: colors.subtext }]}>
                Only backup when connected to Wi-Fi network
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={handleToggleWifiOnly}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Pause on Low Battery</Text>
              <Text style={[styles.settingDesc, { color: colors.subtext }]}>
                Pause background backup when battery is under 20%
              </Text>
            </View>
            <Switch
              value={batterySaverEnabled}
              onValueChange={handleToggleBatterySaver}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </GlassCard>
      </ScrollView>

      <FolderSelectorModal
        visible={showFolderModal}
        selectedAlbums={selectedAlbums}
        onClose={() => setShowFolderModal(false)}
        onSave={handleFolderSave}
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
    paddingBottom: 40,
  },
  heroCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  syncProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  syncStepText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  percentBadge: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
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
    marginTop: 2,
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
    borderRadius: 12,
    gap: 8,
  },
  syncNowBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  folderCard: {
    padding: 14,
    marginBottom: 16,
  },
  folderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  folderIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCardTitleBox: {
    flex: 1,
  },
  folderCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  folderCardSub: {
    fontSize: 12,
  },
  settingCard: {
    padding: 14,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginVertical: 10,
    opacity: 0.5,
  },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
