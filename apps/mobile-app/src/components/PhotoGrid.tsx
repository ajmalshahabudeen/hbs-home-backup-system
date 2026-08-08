import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useAppTheme } from '../context/ThemeContext';
import { useTabBarStore } from '../stores/useTabBarStore';
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
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export type GridRowItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'row'; id: string; items: PhotoMediaItem[]; itemSize: number };

const windowWidth = Dimensions.get('window').width;
const GAP = 1;

// Memoized individual Photo Tile cell for maximum 60 FPS performance
const PhotoTile = memo(
  ({
    item,
    itemSize,
    colors,
    onPress,
  }: {
    item: PhotoMediaItem;
    itemSize: number;
    colors: any;
    onPress: (item: PhotoMediaItem) => void;
  }) => {
    return (
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
        onPress={() => onPress(item)}
      >
        <Image
          source={{ uri: item.localUri || item.thumbUrl || item.url }}
          style={styles.thumbnailImage}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          placeholder={null}
        />

        {item.isBackedUp && (
          <View style={[styles.cloudBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="cloud-done" size={11} color="#FFFFFF" />
          </View>
        )}

        {item.isVideo && (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={10} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  }
);
PhotoTile.displayName = 'PhotoTile';

// Memoized virtualized row component rendering 'columns' tiles per row
const PhotoRow = memo(
  ({
    items,
    columns,
    itemSize,
    colors,
    onSelectMedia,
  }: {
    items: PhotoMediaItem[];
    columns: number;
    itemSize: number;
    colors: any;
    onSelectMedia: (item: PhotoMediaItem) => void;
  }) => {
    return (
      <View style={styles.gridRow}>
        {items.map((item) => (
          <PhotoTile
            key={item.id}
            item={item}
            itemSize={itemSize}
            colors={colors}
            onPress={onSelectMedia}
          />
        ))}
        {/* Render empty placeholders if last row of a group has fewer than 'columns' items */}
        {items.length < columns &&
          Array.from({ length: columns - items.length }).map((_, idx) => (
            <View
              key={`empty_${idx}`}
              style={{ width: itemSize, height: itemSize }}
            />
          ))}
      </View>
    );
  }
);
PhotoRow.displayName = 'PhotoRow';

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  media,
  onSelectMedia,
  onRefresh,
  refreshing = false,
  loading = false,
  onImport,
  onLoadMore,
  hasMore = false,
}) => {
  const { colors } = useAppTheme();
  const [columns, setColumns] = useState<number>(3);

  // Filter, Sort, Group state
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [groupBy, setGroupBy] = useState<GroupByOption>('day');

  const setTabBarVisible = useTabBarStore((s) => s.setTabBarVisible);

  // Reanimated top header scroll animation & 3s auto-restore timer
  const headerTranslateY = useSharedValue(0);
  const lastScrollY = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 2-Finger Pinch Gesture for column count changing
  const isPinchingRef = useRef<boolean>(false);
  const lastPinchTimeRef = useRef<number>(0);

  const handlePressMedia = useCallback(
    (item: PhotoMediaItem) => {
      if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 500) {
        return;
      }
      onSelectMedia(item);
    },
    [onSelectMedia]
  );

  const handleZoomIn = useCallback(() => {
    setColumns((prev) => Math.max(1, prev - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setColumns((prev) => Math.min(5, prev + 1));
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
    })
    .onUpdate(() => {
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
    })
    .onFinalize((event: any) => {
      isPinchingRef.current = false;
      lastPinchTimeRef.current = Date.now();

      if (event && typeof event.scale === 'number') {
        if (event.scale > 1.18) {
          runOnJS(handleZoomIn)();
        } else if (event.scale < 0.85) {
          runOnJS(handleZoomOut)();
        }
      }
    });

  const startStopTimer = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
    }
    stopTimerRef.current = setTimeout(() => {
      headerTranslateY.value = withTiming(0, { duration: 250 });
      setTabBarVisible(true);
    }, 3000);
  }, [headerTranslateY, setTabBarVisible]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const dy = currentY - lastScrollY.current;

    if (currentY <= 10) {
      headerTranslateY.value = withTiming(0, { duration: 200 });
      setTabBarVisible(true);
      lastScrollY.current = currentY;
      return;
    }

    if (dy > 6) {
      headerTranslateY.value = withTiming(-65, { duration: 250 });
      setTabBarVisible(false);
      startStopTimer();
    } else if (dy < -6) {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
      headerTranslateY.value = withTiming(0, { duration: 200 });
      setTabBarVisible(true);
    }

    lastScrollY.current = currentY;
  };

  const handleScrollEnd = () => {
    startStopTimer();
  };

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
    };
  }, []);

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: headerTranslateY.value }],
      opacity: interpolate(headerTranslateY.value, [-50, 0], [0, 1]),
    };
  });

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

  // Calculate edge-to-edge item tile size
  const itemSize = Math.floor((windowWidth - (columns - 1) * GAP) / columns);

  // Group media into section headers & row chunks
  const groupMediaToGridRows = (items: PhotoMediaItem[]): GridRowItem[] => {
    if (groupBy === 'none') {
      const rows: GridRowItem[] = [];
      for (let i = 0; i < items.length; i += columns) {
        const chunk = items.slice(i, i + columns);
        rows.push({
          type: 'row',
          id: `row_none_${chunk[0]?.id || i}`,
          items: chunk,
          itemSize,
        });
      }
      return rows;
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

    const gridRows: GridRowItem[] = [];
    Object.keys(groups).forEach((title, groupIdx) => {
      gridRows.push({
        type: 'header',
        id: `header_${groupIdx}_${title}`,
        title,
      });

      const groupData = groups[title];
      for (let i = 0; i < groupData.length; i += columns) {
        const chunk = groupData.slice(i, i + columns);
        gridRows.push({
          type: 'row',
          id: `row_${groupIdx}_${chunk[0]?.id || i}`,
          items: chunk,
          itemSize,
        });
      }
    });

    return gridRows;
  };

  const gridRows = groupMediaToGridRows(sortedMedia);

  // Render skeleton while initial fetch is loading and media is empty
  if (loading && media.length === 0) {
    return <SkeletonPhotoGrid columns={columns} itemCount={18} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Floating Animated Header Bar */}
      <Animated.View style={[styles.animatedHeader, headerAnimatedStyle, { backgroundColor: colors.background }]}>
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
          onImport={onImport}
          totalCount={sortedMedia.length}
          categories={[
            { label: 'All Media', value: 'all', icon: 'images-outline' },
            { label: 'Photos Only', value: 'image', icon: 'image-outline' },
            { label: 'Videos Only', value: 'video', icon: 'film-outline' },
          ]}
        />
      </Animated.View>

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
        <GestureDetector gesture={pinchGesture}>
          <View style={{ flex: 1 }}>
            <FlashList
              data={gridRows}
              keyExtractor={(item) => item.id}
              getItemType={(item) => item.type}
              refreshControl={
                <RefreshControl
                  refreshing={isPinchingRef.current ? false : refreshing}
                  onRefresh={isPinchingRef.current ? undefined : onRefresh}
                  progressViewOffset={65}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              onScroll={handleScroll}
              onScrollBeginDrag={() => {
                if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
              }}
              onScrollEndDrag={handleScrollEnd}
              onMomentumScrollEnd={handleScrollEnd}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingTop: 48, paddingBottom: 110 }}
              onEndReached={onLoadMore}
              onEndReachedThreshold={0.5}
              renderItem={({ item }) => {
                if (item.type === 'header') {
                  return (
                    <Text style={[styles.groupTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                  );
                }

                return (
                  <PhotoRow
                    items={item.items}
                    columns={columns}
                    itemSize={item.itemSize}
                    colors={colors}
                    onSelectMedia={handlePressMedia}
                  />
                );
              }}
            />
          </View>
        </GestureDetector>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animatedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 4,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: GAP,
    justifyContent: 'flex-start',
  },
  photoCard: {
    borderRadius: 0,
    overflow: 'hidden',
    position: 'relative',
    marginRight: GAP,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  cloudBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    padding: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 80,
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
