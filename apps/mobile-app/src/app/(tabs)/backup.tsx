import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { safeMediaLibrary } from '../../utils/safeMediaLibrary';
import { useAppTheme } from '../../context/ThemeContext';
import { useTabBarStore } from '../../stores/useTabBarStore';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi } from '../../services/api';
import { LanScannerModal } from '../../components/LanScannerModal';
import { FolderSelectorModal } from '../../components/FolderSelectorModal';
import { PermissionModal } from '../../components/PermissionModal';
import { checkFileDuplicate } from '../../utils/dedupe';
import { runParallelUploadQueue } from '../../utils/parallelUploadQueue';
import { getAppPermissionsStatus } from '../../utils/permissions';
import { getSyncConfig, saveSyncConfig } from '../../services/backgroundSync';
import { syncTracker, SyncState } from '../../services/syncTracker';
import { appStorage } from '../../utils/storage';
import { asyncTaskQueue, yieldToInteractions } from '../../utils/asyncTaskQueue';

export default function BackupScreen() {
  const { colors, isDark, isAmoled } = useAppTheme();
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
    asyncTaskQueue.enqueue(
      async () => {
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
      },
      { id: 'calc_folder_items_task', priority: 'low' }
    );
  }, []);

  const loadSettings = useCallback(async () => {
    const config = await getSyncConfig();
    setAutoSyncEnabled(config.autoSyncEnabled);
    setBatterySaverEnabled(config.pauseOnLowBattery);
    setShowSyncNotifications(config.showSyncNotifications !== false);
    setSelectedAlbums(config.selectedAlbums);

    const wifiVal = await appStorage.getItem('hbs_wifi_only');
    if (wifiVal !== null) setWifiOnly(JSON.parse(wifiVal));

    yieldToInteractions().then(() => {
      calculateFolderItemsCount(config.selectedAlbums);
    });
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

    await syncTracker.startSync(1, 'Initializing background auto-sync...');

    asyncTaskQueue.enqueue(
      async () => {
        try {
          const assets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
          if (!assets || assets.length === 0) {
            await syncTracker.finishSync(0, 0);
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
      },
      { id: 'background_user_autosync_task', priority: 'normal' }
    );
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
        {/* Screen Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Backup</Text>
        </View>

        {/* Hero Backup Overview Banner */}
        <View style={[styles.heroContainer, { backgroundColor: groupBg }]}>
          <View style={[styles.heroIconBadge, { backgroundColor: colors.primary + '16' }]}>
            <Ionicons name="cloud-upload" size={30} color={colors.primary} />
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>Camera Roll Auto-Sync</Text>
          <Text style={[styles.heroSub, { color: colors.subtext }]}>
            Continuous deduplicated backup directly to your private home cloud.
          </Text>

          {/* Dynamic Sync Progress */}
          {isSyncing && (
            <View style={[styles.syncProgressBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <View style={styles.syncProgressHeader}>
                <Text style={[styles.syncStepText, { color: colors.primary }]} numberOfLines={1}>
                  {syncStepMessage || 'Syncing in progress...'}
                </Text>
                <Text style={[styles.percentBadge, { color: colors.primary }]}>
                  {Math.round((syncedCount / (totalToSync || 1)) * 100)}%
                </Text>
              </View>

              <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
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

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[
                styles.primarySyncBtn,
                { backgroundColor: isSyncing ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') : colors.primary },
              ]}
              onPress={handleStartAutoSync}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              <Ionicons name="sync" size={17} color="#FFFFFF" />
              <Text style={styles.primarySyncBtnText}>
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondarySyncBtn,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceVariant },
              ]}
              onPress={handleStartManualBackup}
              disabled={isSyncing}
              activeOpacity={0.7}
            >
              <Ionicons name="images-outline" size={17} color={colors.primary} />
              <Text style={[styles.secondarySyncBtnText, { color: colors.primary }]}>
                Select Photos
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats Metric Bar */}
        <View style={[styles.statsGroupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.statColumn}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{backedUpCount}</Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>UPLOADED</Text>
          </View>

          <View style={[styles.statVerticalDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.statColumn}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{skippedDuplicatesCount}</Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>DUPLICATES</Text>
          </View>

          <View style={[styles.statVerticalDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.statColumn}>
            <Text
              style={[
                styles.statNumber,
                { color: isConnected ? (colors.success || '#16A34A') : colors.error, fontSize: 16 },
              ]}
            >
              {isConnected ? 'Online' : 'Offline'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>STATUS</Text>
          </View>
        </View>

        {/* Folders Management */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>FOLDERS & ALBUMS</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <TouchableOpacity
            style={styles.itemRow}
            onPress={() => setShowFolderModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="folder-open" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>
                {selectedAlbums.length === 0 ? 'All Device Albums Selected' : `${selectedAlbums.length} Albums Selected`}
              </Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                {folderTotalItems > 0 ? `${folderTotalItems} items ready to sync` : 'Customize synced folders'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        {/* Backup Target */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DESTINATION</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="server-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Home Backup Server</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]} numberOfLines={1}>
                {isConnected && serverUrl ? serverUrl : 'No server connected'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.destinationBtn,
                { backgroundColor: isConnected ? colors.primary + '18' : colors.primary },
              ]}
              onPress={() => setShowScannerModal(true)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.destinationBtnText,
                  { color: isConnected ? colors.primary : '#FFFFFF' },
                ]}
              >
                {isConnected ? 'Change' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SYNC PREFERENCES</Text>
        </View>

        <View style={[styles.groupContainer, { backgroundColor: groupBg }]}>
          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="sync-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Background Auto-Sync</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Upload new photos & videos automatically
              </Text>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Sync Progress Notifications</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Live progress in notification drawer
              </Text>
            </View>
            <Switch
              value={showSyncNotifications}
              onValueChange={handleToggleShowSyncNotifications}
              trackColor={{ false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="wifi-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Wi-Fi Only Sync</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Avoid mobile data usage
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={handleToggleWifiOnly}
              trackColor={{ false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.insetDivider, { backgroundColor: dividerColor }]} />

          <View style={styles.itemRow}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="battery-charging-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Pause on Low Battery</Text>
              <Text style={[styles.itemSub, { color: colors.subtext }]}>
                Pause sync when battery is under 20%
              </Text>
            </View>
            <Switch
              value={batterySaverEnabled}
              onValueChange={handleToggleBatterySaver}
              trackColor={{ false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
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
  heroContainer: {
    padding: 20,
    borderRadius: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  syncProgressBox: {
    width: '100%',
    marginVertical: 10,
    padding: 12,
    borderRadius: 14,
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
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  fileNameText: {
    fontSize: 11,
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  primarySyncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 7,
  },
  primarySyncBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondarySyncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 7,
  },
  secondarySyncBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  statsGroupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 20,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statVerticalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    marginTop: 4,
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
  destinationBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  destinationBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
