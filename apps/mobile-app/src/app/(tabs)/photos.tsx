import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, PhotoMediaItem } from '../../services/api';
import {
  safeMediaLibrary,
  saveImportedGalleryAssets,
  SafeAsset,
} from '../../utils/safeMediaLibrary';
import { requestMediaPermissionWithPrompt } from '../../utils/permissions';
import { PhotoGrid } from '../../components/PhotoGrid';
import { MediaViewerModal } from '../../components/MediaViewerModal';
import { UploadModal } from '../../components/UploadModal';
import { LanScannerModal } from '../../components/LanScannerModal';
import { useMediaStore } from '../../stores/useMediaStore';

export default function PhotosScreen() {
  const { colors } = useAppTheme();
  const { serverUrl } = useServer();
  const { sessionToken } = useAuth();
  const {
    mediaList,
    setMediaList,
    loading,
    setLoading,
    hasPermission,
    setHasPermission,
    loadFromCache,
  } = useMediaStore();

  const [selectedMedia, setSelectedMedia] = useState<PhotoMediaItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  const fetchPhotos = useCallback(async () => {
    // 0. Load cached data first if available for instant display
    if (mediaList.length === 0) {
      await loadFromCache();
    }
    setLoading(true);

    try {
      // 1. Check local media permissions
      let perm = await safeMediaLibrary.getPermissionsAsync();
      if (!perm.granted) {
        const req = await safeMediaLibrary.requestPermissionsAsync();
        perm = req;
      }
      setHasPermission(perm.granted);

      // 2. Fetch server media
      let serverMedia: PhotoMediaItem[] = [];
      if (serverUrl) {
        try {
          const res = await hbsApi.getPhotos(serverUrl, sessionToken, 'all');
          serverMedia = (res.media || [])
            .filter((m) => !m.name.includes('.hbs-thumb') && !m.path.includes('.hbs-thumb'))
            .map((m) => ({
              ...m,
              isBackedUp: true,
              isLocalOnly: false,
            }));
        } catch {
          // offline or unreachable
        }
      }

      // 3. Fetch all local camera roll media files (photos & videos) from mobile device
      const localAssets = await safeMediaLibrary.getAssetsAsync({ first: 1000 });
      const serverNameSet = new Set(serverMedia.map((m) => m.name.toLowerCase()));

      const mergedList: PhotoMediaItem[] = [...serverMedia];

      // Add local assets if not already on server
      for (const asset of localAssets) {
        const name = asset.filename;
        const existsOnServer = serverNameSet.has(name.toLowerCase());

        if (existsOnServer) {
          // Mark server item as having localUri
          const serverIdx = mergedList.findIndex((m) => m.name.toLowerCase() === name.toLowerCase());
          if (serverIdx !== -1) {
            mergedList[serverIdx].localUri = asset.uri;
          }
        } else {
          // Local only media item on device gallery
          mergedList.push({
            id: `local_${asset.id}`,
            userId: 'local',
            path: name,
            name,
            parentPath: '',
            mimeType: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
            size: 0,
            createdAt: new Date(asset.creationTime).toISOString(),
            updatedAt: new Date(asset.creationTime).toISOString(),
            isVideo: asset.mediaType === 'video',
            url: asset.uri,
            localUri: asset.uri,
            isLocalOnly: true,
            isBackedUp: false,
          });
        }
      }

      // Sort merged list by creation date descending (newest first like native gallery)
      mergedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMediaList(mergedList);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [serverUrl, sessionToken, mediaList.length, loadFromCache, setMediaList, setLoading, setHasPermission]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleRequestPermission = async () => {
    const granted = await requestMediaPermissionWithPrompt();
    if (granted) {
      setHasPermission(true);
      fetchPhotos();
    }
  };

  const handlePickDeviceMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newSafeAssets: SafeAsset[] = result.assets.map((asset, idx) => {
          const fileName =
            asset.fileName ||
            `media_${Date.now()}_${idx}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
          return {
            id: `picker_${Date.now()}_${idx}`,
            filename: fileName,
            uri: asset.uri,
            mediaType: asset.type === 'video' ? 'video' : 'photo',
            creationTime: Date.now(),
          };
        });

        await saveImportedGalleryAssets(newSafeAssets);
        await fetchPhotos();
      }
    } catch (e) {
      Alert.alert(
        'Import Error',
        e instanceof Error ? e.message : 'Could not pick device media'
      );
    }
  };

  const handleUploadMedia = async (uri: string, name: string, mimeType: string) => {
    try {
      await hbsApi.uploadFile(serverUrl, sessionToken, uri, name, mimeType, '');
      Alert.alert('Success', 'Media uploaded successfully.');
      fetchPhotos();
    } catch (e) {
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleUploadItemToServer = async (item: PhotoMediaItem) => {
    if (!item.url) return;
    try {
      const mime = item.mimeType || (item.isVideo ? 'video/mp4' : 'image/jpeg');
      await hbsApi.uploadFile(serverUrl, sessionToken, item.url, item.name, mime, '');
      Alert.alert('Backed Up', `${item.name} uploaded to server.`);
      setSelectedMedia(null);
      fetchPhotos();
    } catch (e) {
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleSaveToDevice = async (item: PhotoMediaItem) => {
    try {
      await hbsApi.downloadFileToDevice(serverUrl, sessionToken, item.path, item.name);
      Alert.alert('Saved', `${item.name} saved to device.`);
    } catch (e) {
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleDeleteMedia = async (item: PhotoMediaItem) => {
    try {
      await hbsApi.deleteFile(serverUrl, sessionToken, item.id);
      fetchPhotos();
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Permission Rationale Banner */}
      {!hasPermission && (
        <View style={[styles.permBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
          <Ionicons name="images-outline" size={24} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.permTitle, { color: colors.text }]}>Photos Permission Required</Text>
            <Text style={[styles.permSub, { color: colors.textSecondary }]}>
              Grant photos permission to automatically load your device's camera roll gallery.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: colors.primary }]}
            onPress={handleRequestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.permBtnText}>Grant</Text>
          </TouchableOpacity>
        </View>
      )}

      <PhotoGrid
        media={mediaList}
        onSelectMedia={(item) => setSelectedMedia(item)}
        onRefresh={fetchPhotos}
        refreshing={loading && mediaList.length > 0}
        loading={loading && mediaList.length === 0}
        onImport={handlePickDeviceMedia}
      />

      {/* Floating Upload Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowUploadModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Fullscreen Photo/Video Viewer */}
      <MediaViewerModal
        visible={!!selectedMedia}
        media={selectedMedia}
        mediaList={mediaList}
        onClose={() => setSelectedMedia(null)}
        onDelete={handleDeleteMedia}
        onUploadToServer={handleUploadItemToServer}
        onSaveToDevice={handleSaveToDevice}
      />

      {/* Upload Modal */}
      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadMedia={handleUploadMedia}
        onCreateFolder={() => {}}
      />

      {/* LAN Scanner Modal */}
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
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  permTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  permSub: {
    fontSize: 11,
    marginTop: 2,
  },
  permBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
});
