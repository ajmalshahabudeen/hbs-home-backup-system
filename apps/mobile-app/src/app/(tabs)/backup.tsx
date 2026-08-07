import React, { useState, useEffect } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { safeMediaLibrary } from '../../utils/safeMediaLibrary';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi } from '../../services/api';
import { Header } from '../../components/Header';
import { LanScannerModal } from '../../components/LanScannerModal';
import { GlassCard } from '../../components/ui/GlassCard';
import { FolderSelectorModal } from '../../components/FolderSelectorModal';
import { PermissionModal } from '../../components/PermissionModal';
import { checkFileDuplicate } from '../../utils/dedupe';
import { getAppPermissionsStatus } from '../../utils/permissions';
import {
  registerBackgroundSyncTask,
  sendLocalSyncNotification,
  getSyncConfig,
  saveSyncConfig,
  syncPhotosNow,
} from '../../services/backgroundSync';
import { appStorage } from '../../utils/storage';

export default function BackupScreen() {
  const { colors } = useAppTheme();
  const { serverUrl, isConnected } = useServer();
  const { sessionToken } = useAuth();

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [wifiOnly, setWifiOnly] = useState<boolean>(true);
  const [batterySaverEnabled, setBatterySaverEnabled] = useState<boolean>(true);
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);

  const [backedUpCount, setBackedUpCount] = useState<number>(0);
  const [skippedDuplicatesCount, setSkippedDuplicatesCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [totalToSync, setTotalToSync] = useState<number>(0);

  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [permissionType, setPermissionType] = useState<'media' | 'notification' | 'background'>('media');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const config = await getSyncConfig();
    setAutoSyncEnabled(config.autoSyncEnabled);
    setBatterySaverEnabled(config.pauseOnLowBattery);
    setSelectedAlbums(config.selectedAlbums);

    const wifiVal = await appStorage.getItem('hbs_wifi_only');
    if (wifiVal !== null) setWifiOnly(JSON.parse(wifiVal));
  };

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
    await registerBackgroundSyncTask(val);

    if (val && isConnected) {
      setIsSyncing(true);
      try {
        const res = await syncPhotosNow(serverUrl, sessionToken);
        setBackedUpCount((prev) => prev + res.synced);
        setSkippedDuplicatesCount((prev) => prev + res.skipped);
        if (res.synced > 0) {
          Alert.alert('Auto-Sync Complete', `Synced ${res.synced} new items to server.`);
        }
      } catch {
        // sync error
      } finally {
        setIsSyncing(false);
      }
    }
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

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const fileName =
          asset.fileName ||
          `backup_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

        // Preflight server deduplication check
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
      }

      setBackedUpCount((prev) => prev + successCount);

      const msg = `Uploaded ${successCount} items.${
        dupCount > 0 ? ` ${dupCount} duplicate items skipped.` : ''
      }`;

      Alert.alert('Backup Complete', msg);
      await sendLocalSyncNotification('HBS Photo Backup Complete', msg);
    } catch (e) {
      Alert.alert('Backup Error', e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header title="Photos Backup" onOpenServerScanner={() => setShowScannerModal(true)} />

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
              <Text style={[styles.syncProgressText, { color: colors.primary }]}>
                Syncing items: {syncedCount} / {totalToSync}
              </Text>
              <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${(syncedCount / (totalToSync || 1)) * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.syncNowBtn,
              { backgroundColor: isSyncing ? colors.border : colors.primary },
            ]}
            onPress={handleStartManualBackup}
            disabled={isSyncing}
          >
            <Ionicons name="images-outline" size={20} color="#FFFFFF" />
            <Text style={styles.syncNowBtnText}>
              {isSyncing ? 'Syncing Photos...' : 'Select Photos & Sync'}
            </Text>
          </TouchableOpacity>
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
            <View style={[styles.folderIconBg, { backgroundColor: colors.primaryContainer }]}>
              <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.folderCardTitle, { color: colors.text }]}>
                Auto-Sync Folders ({selectedAlbums.length} Selected)
              </Text>
              <Text style={[styles.folderCardSub, { color: colors.subtext }]}>
                Select which camera roll albums auto-sync to server
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
          </GlassCard>
        </TouchableOpacity>

        {/* Backup Settings List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Backup & Battery Options</Text>

        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Auto-Sync New Photos</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Upload newly taken media in the background
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
              <Text style={[styles.settingTitle, { color: colors.text }]}>Battery Saver Optimization</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Pause background sync when battery is below 20%
              </Text>
            </View>
            <Switch
              value={batterySaverEnabled}
              onValueChange={handleToggleBatterySaver}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Wi-Fi Only Sync</Text>
              <Text style={[styles.settingSub, { color: colors.subtext }]}>
                Only backup when connected to Wi-Fi to save mobile data
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={handleToggleWifiOnly}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      <FolderSelectorModal
        visible={showFolderModal}
        selectedAlbums={selectedAlbums}
        onSave={handleFolderSave}
        onClose={() => setShowFolderModal(false)}
      />

      <PermissionModal
        visible={showPermissionModal}
        type={permissionType}
        onClose={() => setShowPermissionModal(false)}
        onRequestPermission={async () => {
          await safeMediaLibrary.requestPermissionsAsync();
        }}
      />

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
  heroCard: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  heroSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  syncProgressBox: {
    width: '100%',
    marginTop: 16,
  },
  syncProgressText: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    height: 48,
    borderRadius: 24,
    marginTop: 20,
    gap: 8,
  },
  syncNowBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 4,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  folderIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderCardTitle: {
    fontSize: 15,
    fontWeight: '600',
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
});
