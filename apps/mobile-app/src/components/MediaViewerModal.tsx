import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { PhotoMediaItem } from '../services/api';

interface MediaViewerModalProps {
  visible: boolean;
  media: PhotoMediaItem | null;
  onClose: () => void;
  onDelete?: (media: PhotoMediaItem) => void;
}

const windowHeight = Dimensions.get('window').height;

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  media,
  onClose,
  onDelete,
}) => {
  const { colors } = useAppTheme();

  if (!media) return null;

  const formattedDate = new Date(media.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formattedSize = (media.size / (1024 * 1024)).toFixed(2) + ' MB';

  const handleDelete = () => {
    Alert.alert(
      'Delete Media',
      `Are you sure you want to delete ${media.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (onDelete) onDelete(media);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        {/* Top Action Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {media.name}
            </Text>
            <Text style={styles.headerSub}>{formattedDate}</Text>
          </View>

          <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color="#F28B82" />
          </TouchableOpacity>
        </View>

        {/* Main Media Preview Container */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: media.url }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </View>

        {/* Bottom Details Footer Bar */}
        <View style={styles.footerBar}>
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={18} color="#E8EAED" />
            <Text style={styles.infoText}>{media.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color="#E8EAED" />
            <Text style={styles.infoText}>{formattedDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="resize-outline" size={18} color="#E8EAED" />
            <Text style={styles.infoText}>{formattedSize}</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSub: {
    color: '#9AA0A6',
    fontSize: 12,
    marginTop: 2,
  },
  iconBtn: {
    padding: 8,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    color: '#E8EAED',
    fontSize: 13,
  },
});
