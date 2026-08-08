import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { InputDialogModal } from './InputDialogModal';
import { FileToUpload } from '../utils/folderUploader';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadMedia?: (uri: string, name: string, mimeType: string) => void;
  onUploadBatch?: (files: FileToUpload[]) => void;
  onCreateFolder?: (folderName: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  visible,
  onClose,
  onUploadMedia,
  onUploadBatch,
  onCreateFolder,
}) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [showFolderInput, setShowFolderInput] = useState(false);

  // Modern Expo SDK 57 File.pickFileAsync for multiple document / file uploads
  const handlePickFiles = async () => {
    try {
      const res = await File.pickFileAsync({
        multipleFiles: true,
      });

      if (!res.canceled && res.result && res.result.length > 0) {
        const fileItems: FileToUpload[] = res.result.map((f: any) => ({
          uri: f.uri,
          name: f.name || `file_${Date.now()}`,
          mimeType: f.mimeType || 'application/octet-stream',
          relativePath: f.name,
        }));

        if (onUploadBatch) {
          onUploadBatch(fileItems);
        } else if (onUploadMedia && fileItems.length > 0) {
          onUploadMedia(fileItems[0].uri, fileItems[0].name, fileItems[0].mimeType || 'application/octet-stream');
        }
        onClose();
      }
    } catch (e) {
      Alert.alert('File Picker Error', 'Could not open native file picker.');
    }
  };

  // Folder Upload: Picker for folder or multiple nested files
  const handlePickFolder = async () => {
    try {
      const res = await File.pickFileAsync({
        multipleFiles: true,
      });

      if (!res.canceled && res.result && res.result.length > 0) {
        // Extract folder relative paths if present
        const fileItems: FileToUpload[] = res.result.map((f: any) => {
          const rawUri = decodeURIComponent(f.uri || '');
          let relPath = f.name || `file_${Date.now()}`;
          if (rawUri.includes('/')) {
            const parts = rawUri.split('/').filter(Boolean);
            if (parts.length >= 2) {
              const lastTwo = parts.slice(-2);
              relPath = `${lastTwo[0]}/${lastTwo[1]}`;
            }
          }
          return {
            uri: f.uri,
            name: f.name || `file_${Date.now()}`,
            mimeType: f.mimeType || 'application/octet-stream',
            relativePath: relPath,
          };
        });

        if (onUploadBatch) {
          onUploadBatch(fileItems);
        }
        onClose();
      }
    } catch {
      Alert.alert('Folder Picker Error', 'Could not access folder contents.');
    }
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Permission to access media library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const fileItems: FileToUpload[] = result.assets.map((asset, i) => {
        const fileName = asset.fileName || `media_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        return {
          uri: asset.uri,
          name: fileName,
          mimeType,
          relativePath: fileName,
        };
      });

      if (onUploadBatch) {
        onUploadBatch(fileItems);
      } else if (onUploadMedia && fileItems.length > 0) {
        onUploadMedia(fileItems[0].uri, fileItems[0].name, fileItems[0].mimeType || 'image/jpeg');
      }
      onClose();
    }
  };

  const handleCreateFolderClick = () => {
    setShowFolderInput(true);
  };

  return (
    <>
      <Modal visible={visible && !showFolderInput} animationType="slide" transparent onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheet, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 24) }]}>
                <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

                <Text style={[styles.sheetTitle, { color: colors.text }]}>Create & Upload</Text>

                <View style={styles.optionsGrid}>
                  {/* Upload Folder */}
                  <TouchableOpacity
                    style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                    onPress={handlePickFolder}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: '#34A853' + '20' }]}>
                      <Ionicons name="folder-open" size={26} color="#34A853" />
                    </View>
                    <Text style={[styles.optionText, { color: colors.text }]}>
                      Upload Folder
                    </Text>
                  </TouchableOpacity>

                  {/* Upload Multiple Files */}
                  <TouchableOpacity
                    style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                    onPress={handlePickFiles}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: '#4285F4' + '20' }]}>
                      <Ionicons name="document-text" size={26} color="#4285F4" />
                    </View>
                    <Text style={[styles.optionText, { color: colors.text }]}>
                      Upload Files
                    </Text>
                  </TouchableOpacity>

                  {/* Upload Media */}
                  <TouchableOpacity
                    style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                    onPress={handlePickPhoto}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: '#EA4335' + '20' }]}>
                      <Ionicons name="images" size={26} color="#EA4335" />
                    </View>
                    <Text style={[styles.optionText, { color: colors.text }]}>
                      Upload Media
                    </Text>
                  </TouchableOpacity>

                  {/* New Folder */}
                  <TouchableOpacity
                    style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                    onPress={handleCreateFolderClick}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: '#FBBC05' + '20' }]}>
                      <Ionicons name="create-outline" size={26} color="#FBBC05" />
                    </View>
                    <Text style={[styles.optionText, { color: colors.text }]}>
                      New Folder
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={onClose}
                >
                  <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <InputDialogModal
        visible={showFolderInput}
        title="Create New Folder"
        placeholder="Folder name..."
        confirmLabel="Create"
        onConfirm={(folderName) => {
          if (onCreateFolder) {
            onCreateFolder(folderName);
          }
          setShowFolderInput(false);
          onClose();
        }}
        onClose={() => setShowFolderInput(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  optionCard: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
