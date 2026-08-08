import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { hbsApi, BackupFileItem, PhotoMediaItem } from '../../services/api';
import { DriveFileList } from '../../components/DriveFileList';
import { UploadModal } from '../../components/UploadModal';
import { MediaViewerModal } from '../../components/MediaViewerModal';
import { LanScannerModal } from '../../components/LanScannerModal';
import { useDriveStore } from '../../stores/useDriveStore';
import { useUploadModalStore } from '../../stores/useUploadModalStore';
import { uploadFilesAndFolders, FileToUpload } from '../../utils/folderUploader';
import { asyncTaskQueue, yieldToInteractions } from '../../utils/asyncTaskQueue';

export default function DriveScreen() {
  const { colors } = useAppTheme();
  const { serverUrl } = useServer();
  const { sessionToken } = useAuth();
  const {
    displayFiles,
    currentPath,
    loading,
    hasMoreChunks,
    setFiles,
    setCurrentPath,
    setLoading,
    loadMoreChunks,
    loadFromCache,
  } = useDriveStore();

  const showUploadModal = useUploadModalStore((s) => s.showUploadModal);
  const closeUploadModal = useUploadModalStore((s) => s.closeUploadModal);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [previewMedia, setPreviewMedia] = useState<PhotoMediaItem | null>(null);
  const isMounted = useRef<boolean>(true);


  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      asyncTaskQueue.cancel('fetch_drive_files_task');
    };
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!serverUrl) return;

    if (displayFiles.length === 0) {
      await loadFromCache(currentPath);
    }
    setLoading(true);

    asyncTaskQueue.enqueue(
      async (abortSignal) => {
        try {
          const res = await hbsApi.getFiles(serverUrl, sessionToken, currentPath, 'all');
          if (!abortSignal.isCancelled && isMounted.current) {
            setFiles(res.files || []);
          }
        } catch {
          // ignore
        } finally {
          if (isMounted.current) {
            setLoading(false);
          }
        }
      },
      { id: 'fetch_drive_files_task', priority: 'high' }
    );
  }, [serverUrl, sessionToken, currentPath, displayFiles.length, loadFromCache, setFiles, setLoading]);

  useEffect(() => {
    yieldToInteractions().then(() => {
      if (isMounted.current) {
        fetchFiles();
      }
    });
  }, [fetchFiles]);

  const driveMediaList: PhotoMediaItem[] = displayFiles
    .filter((f) => !f.isDir && (f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')))
    .map((f) => ({
      ...f,
      isVideo: f.mimeType?.startsWith('video/') || false,
      url: `${serverUrl}/api/files/download?path=${encodeURIComponent(f.path)}&token=${encodeURIComponent(sessionToken || '')}`,
      isLocalOnly: false,
      isBackedUp: true,
    }));

  const handleOpenFile = (file: BackupFileItem) => {
    if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) {
      setPreviewMedia({
        ...file,
        isVideo: file.mimeType.startsWith('video/'),
        url: `${serverUrl}/api/files/download?path=${encodeURIComponent(file.path)}&token=${encodeURIComponent(sessionToken || '')}`,
        isLocalOnly: false,
        isBackedUp: true,
      });
    }
  };

  const handleUploadMedia = async (uri: string, name: string, mimeType: string) => {
    try {
      await hbsApi.uploadFile(serverUrl, sessionToken, uri, name, mimeType, currentPath);
      Alert.alert('Success', 'File uploaded successfully.');
      fetchFiles();
    } catch (e) {
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleUploadBatch = async (batchFiles: FileToUpload[]) => {
    try {
      const res = await uploadFilesAndFolders(serverUrl, sessionToken, batchFiles, currentPath);
      Alert.alert('Upload Complete', `Successfully uploaded ${res.successCount} item(s).`);
      fetchFiles();
    } catch (e) {
      Alert.alert('Upload Error', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    try {
      await hbsApi.createFolder(serverUrl, sessionToken, folderName, currentPath);
      fetchFiles();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleRenameFile = async (file: BackupFileItem, newName: string) => {
    try {
      await hbsApi.renameFile(serverUrl, sessionToken, file.path, newName);
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
      <DriveFileList
        files={displayFiles}
        currentPath={currentPath}
        onNavigatePath={(p) => setCurrentPath(p)}
        onOpenFile={handleOpenFile}
        onRenameFile={handleRenameFile}
        onDeleteFile={handleDeleteFile}
        onRefresh={fetchFiles}
        refreshing={loading && displayFiles.length > 0}
        onLoadMore={loadMoreChunks}
        hasMore={hasMoreChunks}
      />

      <UploadModal
        visible={showUploadModal}
        onClose={closeUploadModal}
        onUploadMedia={handleUploadMedia}
        onUploadBatch={handleUploadBatch}
        onCreateFolder={handleCreateFolder}
      />


      <MediaViewerModal
        visible={!!previewMedia}
        media={previewMedia}
        mediaList={driveMediaList}
        onClose={() => setPreviewMedia(null)}
        onDelete={(item) => {
          handleDeleteFile({
            id: item.id,
            userId: item.userId,
            path: item.path,
            name: item.name,
            parentPath: item.parentPath,
            isDir: false,
            mimeType: item.mimeType,
            size: item.size,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          });
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
