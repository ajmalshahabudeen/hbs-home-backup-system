import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { PhotoMediaItem } from '../services/api';

interface PhotoGridProps {
  media: PhotoMediaItem[];
  onSelectMedia: (item: PhotoMediaItem) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface DateGroup {
  title: string;
  data: PhotoMediaItem[];
}

const windowWidth = Dimensions.get('window').width;

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  media,
  onSelectMedia,
  onRefresh,
  refreshing = false,
}) => {
  const { colors } = useAppTheme();
  const [columns, setColumns] = useState<number>(3);

  // Group media by Date
  const groupMediaByDate = (items: PhotoMediaItem[]): DateGroup[] => {
    const groups: Record<string, PhotoMediaItem[]> = {};

    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    items.forEach((item) => {
      const d = new Date(item.createdAt);
      let groupKey = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      if (d.toDateString() === todayStr) {
        groupKey = 'Today';
      } else if (d.toDateString() === yesterdayStr) {
        groupKey = 'Yesterday';
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return Object.keys(groups).map((title) => ({
      title,
      data: groups[title],
    }));
  };

  const dateGroups = groupMediaByDate(media);
  const itemSize = (windowWidth - 32 - (columns - 1) * 4) / columns;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Column Switcher Bar */}
      <View style={styles.topControlRow}>
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {media.length} {media.length === 1 ? 'item' : 'photos & videos'}
        </Text>

        <View style={[styles.gridToggleContainer, { backgroundColor: colors.surfaceVariant }]}>
          {[2, 3, 4].map((col) => (
            <TouchableOpacity
              key={col}
              style={[
                styles.gridToggleBtn,
                columns === col && { backgroundColor: colors.card },
              ]}
              onPress={() => setColumns(col)}
            >
              <Text
                style={[
                  styles.gridToggleText,
                  { color: columns === col ? colors.primary : colors.textSecondary },
                ]}
              >
                {col}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {media.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Photos Yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            Upload photos from your camera roll or backup automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={dateGroups}
          keyExtractor={(item) => item.title}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item: group }) => (
            <View style={styles.groupSection}>
              <Text style={[styles.groupTitle, { color: colors.text }]}>
                {group.title}
              </Text>

              <View style={styles.gridContainer}>
                {group.data.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.photoCard,
                      {
                        width: itemSize,
                        height: itemSize,
                        backgroundColor: colors.surfaceVariant,
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => onSelectMedia(item)}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={styles.thumbnailImage}
                      resizeMode="cover"
                    />

                    {item.isVideo && (
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  gridToggleContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  gridToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gridToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  groupSection: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  photoCard: {
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
