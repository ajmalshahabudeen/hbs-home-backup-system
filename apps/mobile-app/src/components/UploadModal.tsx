import React from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadMedia: (uri: string, name: string, mimeType: string) => void;
  onCreateFolder: (folderName: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  visible,
  onClose,
  onUploadMedia,
  onCreateFolder,
}) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Permission to access media library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.fileName || `upload_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
      const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      onUploadMedia(asset.uri, fileName, mimeType);
      onClose();
    }
  };

  const handleCreateFolderPrompt = () => {
    onClose();
    Alert.prompt(
      'Create New Folder',
      'Enter folder name:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: (name?: string) => {
            if (name && name.trim()) {
              onCreateFolder(name.trim());
            }
          },
        },
      ],
      'plain-text'
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

              <Text style={[styles.sheetTitle, { color: colors.text }]}>Create & Upload</Text>

              <View style={styles.optionsGrid}>
                {/* Upload Photo/Video */}
                <TouchableOpacity
                  style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                  onPress={handlePickPhoto}
                >
                  <View style={[styles.optionIcon, { backgroundColor: '#1A73E8' + '20' }]}>
                    <Ionicons name="images" size={26} color="#1A73E8" />
                  </View>
                  <Text style={[styles.optionText, { color: colors.text }]}>
                    Upload Media
                  </Text>
                </TouchableOpacity>

                {/* Create Folder */}
                <TouchableOpacity
                  style={[styles.optionCard, { backgroundColor: colors.surfaceVariant }]}
                  onPress={handleCreateFolderPrompt}
                >
                  <View style={[styles.optionIcon, { backgroundColor: '#F9AB00' + '20' }]}>
                    <Ionicons name="folder-open" size={26} color="#F9AB00" />
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
    paddingHorizontal: 24,
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
    marginBottom: 20,
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  optionCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 10,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
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
