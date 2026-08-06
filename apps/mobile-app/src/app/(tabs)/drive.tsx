import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, BackupFileItem } from '../../services/api';
import { Header } from '../../components/Header';
import { DriveFileList } from '../../components/DriveFileList';
import { UploadModal } from '../../components/UploadModal';
import { MediaViewerModal } from '../../components/MediaViewerModal';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function DriveScreen() {
  const { colors } = useAppTheme();
  const { serverUrl } = useServer();
  const { sessionToken } = useAuth();

  const [files, setFiles] = useState<BackupFileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [previewMedia, setPreviewMedia] = useState<{
    id: string;
    userId: string;
    path: string;
    name: string;
    parentPath: string;
    mimeType: string | null;
    size: number;
    createdAt: string;
    updatedAt: string;
    isVideo: boolean;
    url: string;
  } | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!serverUrl) return;
    setLoading(true);
    try {
      const res = await hbsApi.getFiles(serverUrl, sessionToken, currentPath, 'all');
      setFiles(res.files || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [serverUrl, sessionToken, currentPath]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleOpenFile = (file: BackupFileItem) => {
    if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) {
      setPreviewMedia({
        ...file,
        isVideo: file.mimeType.startsWith('video/'),
        url: hbsApi.getMediaUrl(serverUrl, file.path),
      });
    } else {
      Alert.alert(file.name, `Type: ${file.mimeType || 'Unknown'}\nSize: ${(file.size / 1024).toFixed(1)} KB`);
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    try {
      await hbsApi.createFolder(serverUrl, sessionToken, folderName, currentPath);
      fetchFiles();
    } catch (e) {
      Alert.alert('Create Folder Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleUploadMedia = async (uri: string, name: string, mimeType: string) => {
    try {
      await hbsApi.uploadFile(serverUrl, sessionToken, uri, name, mimeType, currentPath);
      Alert.alert('Success', 'File uploaded.');
      fetchFiles();
    } catch (e) {
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleRenameFile = async (file: BackupFileItem, newName: string) => {
    try {
      await hbsApi.renameFile(serverUrl, sessionToken, file.id, newName);
      fetchFiles();
    } catch (e) {
      Alert.alert('Rename Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleDeleteFile = async (file: BackupFileItem) => {
    try {
      await hbsApi.deleteFile(serverUrl, sessionToken, file.id);
      fetchFiles();
    } catch (e) {
      Alert.alert('Delete Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Header title="Google Drive" onOpenServerScanner={() => setShowScannerModal(true)} />

      <DriveFileList
        files={files}
        currentPath={currentPath}
        onNavigatePath={(p) => setCurrentPath(p)}
        onOpenFile={handleOpenFile}
        onRenameFile={handleRenameFile}
        onDeleteFile={handleDeleteFile}
        onRefresh={fetchFiles}
        refreshing={loading}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowUploadModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadMedia={handleUploadMedia}
        onCreateFolder={handleCreateFolder}
      />

      <MediaViewerModal
        visible={!!previewMedia}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
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
