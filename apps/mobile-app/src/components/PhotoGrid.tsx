import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useAppTheme } from '../context/ThemeContext';
import { PhotoMediaItem } from '../services/api';
import {
  FilterSortBar,
  SortField,
  SortOrder,
  GroupByOption,
} from './FilterSortBar';
import { SkeletonPhotoGrid } from './SkeletonPhotoGrid';

interface PhotoGridProps {
  media: PhotoMediaItem[];
  onSelectMedia: (item: PhotoMediaItem) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  loading?: boolean;
  onImport?: () => void;
}

interface MediaGroup {
  title: string;
  data: PhotoMediaItem[];
}

const windowWidth = Dimensions.get('window').width;

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  media,
  onSelectMedia,
  onRefresh,
  refreshing = false,
  loading = false,
  onImport,
}) => {
  const { colors } = useAppTheme();
  const [columns, setColumns] = useState<number>(3);

  // Filter, Sort, Group state
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [groupBy, setGroupBy] = useState<GroupByOption>('day');

  // Filter items
  const filteredMedia = media.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (category === 'image') return !item.isVideo;
    if (category === 'video') return item.isVideo;
    return true;
  });

  // Sort items
  const sortedMedia = [...filteredMedia].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === 'size') {
      cmp = b.size - a.size;
    }
    return sortOrder === 'desc' ? cmp : -cmp;
  });

  // Group media according to groupBy option
  const groupMedia = (items: PhotoMediaItem[]): MediaGroup[] => {
    if (groupBy === 'none') {
      return [{ title: '', data: items }];
    }

    const groups: Record<string, PhotoMediaItem[]> = {};

    const todayStr = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    items.forEach((item) => {
      const d = new Date(item.createdAt);
      let groupKey = '';

      if (groupBy === 'category') {
        groupKey = item.isVideo ? 'Videos' : 'Photos';
      } else if (groupBy === 'year') {
        groupKey = String(d.getFullYear());
      } else if (groupBy === 'month') {
        groupKey = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else {
        // day grouping default
        if (d.toDateString() === todayStr) {
          groupKey = 'Today';
        } else if (d.toDateString() === yesterdayStr) {
          groupKey = 'Yesterday';
        } else {
          groupKey = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        }
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return Object.keys(groups).map((title) => ({
      title,
      data: groups[title],
    }));
  };

  const mediaGroups = groupMedia(sortedMedia);
  const itemSize = (windowWidth - 32 - (columns - 1) * 4) / columns;

  // Render skeleton while initial fetch is loading and media is empty
  if (loading && media.length === 0) {
    return <SkeletonPhotoGrid columns={columns} itemCount={18} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Ultra-Compact Control Bar with Search, Dropdowns & Import */}
      <FilterSortBar
        searchQuery={search}
        onSearchChange={setSearch}
        selectedCategory={category}
        onCategorySelect={setCategory}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={(f, o) => {
          setSortField(f);
          setSortOrder(o);
        }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        columns={columns}
        onColumnsChange={setColumns}
        onImport={onImport}
        totalCount={sortedMedia.length}
        categories={[
          { label: 'All Media', value: 'all', icon: 'images-outline' },
          { label: 'Photos Only', value: 'image', icon: 'image-outline' },
          { label: 'Videos Only', value: 'video', icon: 'film-outline' },
        ]}
      />

      {sortedMedia.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={56} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Media Found</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {search
              ? `No items matching "${search}"`
              : 'Upload photos from your device or configure auto-sync.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={mediaGroups}
          keyExtractor={(item, idx) => item.title || `group_${idx}`}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item: group }) => (
            <View style={styles.groupSection}>
              {group.title ? (
                <Text style={[styles.groupTitle, { color: colors.text }]}>
                  {group.title}
                </Text>
              ) : null}

              <View style={styles.gridContainer}>
                {group.data.map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInUp.delay(Math.min(index * 25, 300)).duration(300)}
                  >
                    <TouchableOpacity
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
                        source={{
                          uri: item.localUri || item.thumbUrl || item.url,
                          headers:
                            !item.localUri && item.url?.startsWith('http')
                              ? undefined // token already in query string
                              : undefined,
                        }}
                        style={styles.thumbnailImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                        placeholder={null}
                      />

                      {item.isBackedUp && (
                        <View style={[styles.cloudBadge, { backgroundColor: colors.primary }]}>
                          <Ionicons name="cloud-done" size={13} color="#FFFFFF" />
                        </View>
                      )}

                      {item.isVideo && (
                        <View style={styles.videoBadge}>
                          <Ionicons name="play" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
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
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  countText: {
    fontSize: 13,
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
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  photoCard: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  cloudBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
