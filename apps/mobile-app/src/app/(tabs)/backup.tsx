import React, { useState } from 'react';
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
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi } from '../../services/api';
import { Header } from '../../components/Header';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function BackupScreen() {
  const { colors } = useAppTheme();
  const { serverUrl, isConnected } = useServer();
  const { sessionToken } = useAuth();

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [wifiOnly, setWifiOnly] = useState<boolean>(true);
  const [backedUpCount, setBackedUpCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [totalToSync, setTotalToSync] = useState<number>(0);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  const handleStartManualBackup = async () => {
    if (!isConnected) {
      Alert.alert('Server Offline', 'Please connect to your HBS home server to start backup.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Camera roll access is needed to select photos for backup.');
      return;
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

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const fileName =
          asset.fileName ||
          `backup_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');

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
          // continue
        }
        setSyncedCount(i + 1);
      }

      setBackedUpCount((prev) => prev + successCount);
      Alert.alert('Backup Complete', `Successfully uploaded ${successCount} items to server.`);
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
        {/* Backup Status Hero Box */}
        <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant }]}>
          <View style={[styles.heroIconBadge, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="cloud-upload" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>Camera Roll Auto-Sync</Text>

          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Back up photos and videos directly from your phone to your private HBS home server storage.
          </Text>

          {isSyncing && (
            <View style={styles.syncProgressBox}>
              <Text style={[styles.syncProgressText, { color: colors.primary }]}>
                Syncing items to server: {syncedCount} / {totalToSync}
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
        </View>

        {/* Quick Stats Grid */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {backedUpCount}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Items Uploaded Session
            </Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: isConnected ? colors.success : colors.error }]}>
              {isConnected ? 'Connected' : 'Offline'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Server Status
            </Text>
          </View>
        </View>

        {/* Backup Settings List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Backup Options</Text>

        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Auto-Sync New Photos</Text>
              <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                Upload newly taken media when connected to LAN Wi-Fi
              </Text>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={setAutoSyncEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Wi-Fi Only Sync</Text>
              <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                Only backup when connected to Wi-Fi to save cellular data
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={setWifiOnly}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>
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
  heroCard: {
    borderRadius: 20,
    padding: 24,
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
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  settingsGroup: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingTitle: {
    fontSize: 15,
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
