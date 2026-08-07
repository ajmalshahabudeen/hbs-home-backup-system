import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, PhotoMediaItem } from '../../services/api';
import { safeMediaLibrary } from '../../utils/safeMediaLibrary';
import { Header } from '../../components/Header';
import { PhotoGrid } from '../../components/PhotoGrid';
import { MediaViewerModal } from '../../components/MediaViewerModal';
import { UploadModal } from '../../components/UploadModal';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function PhotosScreen() {
  const { colors } = useAppTheme();
  const { serverUrl } = useServer();
  const { sessionToken } = useAuth();

  const [mediaList, setMediaList] = useState<PhotoMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMedia, setSelectedMedia] = useState<PhotoMediaItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch server media
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

      // 2. Fetch local camera roll media
      const localAssets = await safeMediaLibrary.getAssetsAsync({ first: 150 });
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
          // Local only media item
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

      // Sort merged list by creation date descending
      mergedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMediaList(mergedList);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [serverUrl, sessionToken]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

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
      <Header
        title="Photos"
        onOpenServerScanner={() => setShowScannerModal(true)}
      />

      <PhotoGrid
        media={mediaList}
        onSelectMedia={(item) => setSelectedMedia(item)}
        onRefresh={fetchPhotos}
        refreshing={loading}
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
