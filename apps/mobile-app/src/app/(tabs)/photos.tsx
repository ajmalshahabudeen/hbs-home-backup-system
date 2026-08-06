import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, PhotoMediaItem } from '../../services/api';
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
    if (!serverUrl) return;
    setLoading(true);
    try {
      const res = await hbsApi.getPhotos(serverUrl, sessionToken, 'all');
      setMediaList(res.media || []);
    } catch {
      // ignore
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

  const handleDeleteMedia = async (item: PhotoMediaItem) => {
    try {
      await hbsApi.deleteFile(serverUrl, sessionToken, item.id);
      fetchPhotos();
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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

      {/* Fullscreen Photo Viewer */}
      <MediaViewerModal
        visible={!!selectedMedia}
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onDelete={handleDeleteMedia}
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
