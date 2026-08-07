import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAppTheme } from '../context/ThemeContext';
import { PhotoMediaItem } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MediaViewerModalProps {
  visible: boolean;
  media: PhotoMediaItem | null;
  mediaList?: PhotoMediaItem[];
  onClose: () => void;
  onDelete?: (media: PhotoMediaItem) => void;
  onUploadToServer?: (media: PhotoMediaItem) => void;
  onSaveToDevice?: (media: PhotoMediaItem) => void;
}

const VideoPlayerComponent: React.FC<{ url: string }> = ({ url }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });

  return <VideoView style={styles.fullVideo} player={player} />;
};

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  media,
  mediaList = [],
  onClose,
  onDelete,
  onUploadToServer,
  onSaveToDevice,
}) => {
  const { colors } = useAppTheme();
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Construct full list: if mediaList is provided use it, otherwise wrap media into single-item array
  const items: PhotoMediaItem[] =
    mediaList && mediaList.length > 0
      ? mediaList
      : media
      ? [media]
      : [];

  useEffect(() => {
    if (visible && media && items.length > 0) {
      const idx = items.findIndex((m) => m.id === media.id || m.url === media.url);
      const targetIndex = idx >= 0 ? idx : 0;
      setCurrentIndex(targetIndex);

      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      }, 50);
    }
  }, [visible, media]);

  if (!visible || items.length === 0) return null;

  const activeItem = items[currentIndex] || items[0] || media;

  const formattedDate = new Date(activeItem.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formattedSize =
    activeItem.size > 0 ? (activeItem.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Local file';

  const handleDelete = () => {
    Alert.alert('Delete Media', `Are you sure you want to delete ${activeItem.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (onDelete) onDelete(activeItem);
          if (items.length <= 1) {
            onClose();
          }
        },
      },
    ]);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const newIdx = currentIndex - 1;
      setCurrentIndex(newIdx);
      listRef.current?.scrollToIndex({ index: newIdx, animated: true });
    }
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      const newIdx = currentIndex + 1;
      setCurrentIndex(newIdx);
      listRef.current?.scrollToIndex({ index: newIdx, animated: true });
    }
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
              {activeItem.name}
            </Text>
            <Text style={styles.headerSub}>
              {currentIndex + 1} of {items.length} · {formattedDate}
            </Text>
          </View>

          <View style={styles.rightActions}>
            {/* Upload to server button for local-only media */}
            {activeItem.isLocalOnly && onUploadToServer && (
              <TouchableOpacity
                style={[styles.actionBadge, { backgroundColor: '#1A73E8' }]}
                onPress={() => onUploadToServer(activeItem)}
              >
                <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                <Text style={styles.actionBadgeText}>Upload</Text>
              </TouchableOpacity>
            )}

            {/* Save to device button for server media */}
            {!activeItem.isLocalOnly && onSaveToDevice && (
              <TouchableOpacity
                style={[styles.actionBadge, { backgroundColor: '#34A853' }]}
                onPress={() => onSaveToDevice(activeItem)}
              >
                <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                <Text style={styles.actionBadgeText}>Save</Text>
              </TouchableOpacity>
            )}

            {onDelete && !activeItem.isLocalOnly && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color="#F28B82" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Main Swipeable Media Gallery */}
        <View style={styles.mediaContainer}>
          <FlatList
            ref={listRef}
            data={items}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item.id}_${index}`}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              if (newIdx >= 0 && newIdx < items.length) {
                setCurrentIndex(newIdx);
              }
            }}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
                {item.isVideo ? (
                  <VideoPlayerComponent url={item.url} />
                ) : (
                  <Image
                    source={{ uri: item.url }}
                    style={styles.fullImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            )}
          />

          {/* Swipe Left / Right Navigation Overlay Controls */}
          {currentIndex > 0 && (
            <TouchableOpacity style={[styles.navBtn, styles.prevBtn]} onPress={handlePrev}>
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {currentIndex < items.length - 1 && (
            <TouchableOpacity style={[styles.navBtn, styles.nextBtn]} onPress={handleNext}>
              <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Details Footer Bar */}
        <View style={styles.footerBar}>
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={18} color="#E8EAED" />
            <Text style={styles.infoText} numberOfLines={1}>
              {activeItem.name}
            </Text>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  headerSub: {
    color: '#9AA0A6',
    fontSize: 12,
    marginTop: 2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  actionBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtn: {
    padding: 8,
  },
  mediaContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  navBtn: {
    position: 'absolute',
    top: '45%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  prevBtn: {
    left: 12,
  },
  nextBtn: {
    right: 12,
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 6,
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
