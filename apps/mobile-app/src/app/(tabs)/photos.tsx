import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useUploadModalStore } from '../../stores/useUploadModalStore';
import { uploadFilesAndFolders, FileToUpload } from '../../utils/folderUploader';

import { asyncTaskQueue, yieldToUI, yieldToInteractions } from '../../utils/asyncTaskQueue';

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
  const showUploadModal = useUploadModalStore((s) => s.showUploadModal);
  const closeUploadModal = useUploadModalStore((s) => s.closeUploadModal);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const isMounted = useRef<boolean>(true);


  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      asyncTaskQueue.cancel('fetch_photos_task');
    };
  }, []);

  const fetchPhotos = useCallback(async () => {
    if (mediaList.length === 0) {
      await loadFromCache();
    }
    setLoading(true);

    asyncTaskQueue.enqueue(
      async (abortSignal) => {
        try {
          let perm = await safeMediaLibrary.getPermissionsAsync();
          if (!perm.granted) {
            const req = await safeMediaLibrary.requestPermissionsAsync();
            perm = req;
          }
          if (abortSignal.isCancelled || !isMounted.current) return;
          setHasPermission(perm.granted);

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
          if (abortSignal.isCancelled || !isMounted.current) return;

          const localAssets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
          if (abortSignal.isCancelled || !isMounted.current) return;

          // O(1) Map lookups instead of O(N^2) findIndex scanning
          const serverIndexMap = new Map<string, number>();
          serverMedia.forEach((m, idx) => {
            serverIndexMap.set(m.name.toLowerCase(), idx);
          });

          const mergedList: PhotoMediaItem[] = [...serverMedia];

          let count = 0;
          for (const asset of localAssets) {
            if (abortSignal.isCancelled || !isMounted.current) return;
            count++;
            if (count % 200 === 0) {
              await yieldToUI();
            }

            const name = asset.filename;
            const nameLower = name.toLowerCase();
            const serverIdx = serverIndexMap.get(nameLower);

            if (serverIdx !== undefined) {
              mergedList[serverIdx].localUri = asset.uri;
            } else {
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

          if (abortSignal.isCancelled || !isMounted.current) return;
          await yieldToUI();
          mergedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (!abortSignal.isCancelled && isMounted.current) {
            setMediaList(mergedList);
          }
        } catch {
          // fallback
        } finally {
          if (isMounted.current) {
            setLoading(false);
          }
        }
      },
      { id: 'fetch_photos_task', priority: 'high' }
    );
  }, [serverUrl, sessionToken, mediaList.length, loadFromCache, setMediaList, setLoading, setHasPermission]);

  useEffect(() => {
    yieldToInteractions().then(() => {
      if (isMounted.current) {
        fetchPhotos();
      }
    });
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

  const handleUploadBatch = async (batchFiles: FileToUpload[]) => {
    try {
      const res = await uploadFilesAndFolders(serverUrl, sessionToken, batchFiles, '');
      Alert.alert('Upload Complete', `Uploaded ${res.successCount} item(s) to cloud server.`);
      fetchPhotos();
    } catch (e) {
      Alert.alert('Upload Error', e instanceof Error ? e.message : 'Upload failed');
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

      <MediaViewerModal
        visible={!!selectedMedia}
        media={selectedMedia}
        mediaList={mediaList}
        onClose={() => setSelectedMedia(null)}
        onDelete={handleDeleteMedia}
        onUploadToServer={handleUploadItemToServer}
        onSaveToDevice={handleSaveToDevice}
      />

      <UploadModal
        visible={showUploadModal}
        onClose={closeUploadModal}
        onUploadMedia={handleUploadMedia}
        onUploadBatch={handleUploadBatch}
        onCreateFolder={() => {}}
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
