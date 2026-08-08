import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  FadeInUp,
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

interface MediaGroup {
  title: string;
  data: PhotoMediaItem[];
}

const windowWidth = Dimensions.get('window').width;
const GAP = 1;

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

  // 2-Finger Pinch Gesture for column count changing (without visual scale transforms)
  const isPinchingRef = useRef<boolean>(false);
  const lastPinchTimeRef = useRef<number>(0);

  const handlePressMedia = useCallback(
    (item: PhotoMediaItem) => {
      // Ignore click if a 2-finger pinch gesture is active or finished within the last 500ms
      if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 500) {
        return;
      }
      onSelectMedia(item);
    },
    [onSelectMedia]
  );

  const handleZoomIn = useCallback(() => {
    // Pinch OUT -> decrease columns (larger photo tile size)
    setColumns((prev) => Math.max(1, prev - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    // Pinch IN -> increase columns (smaller photo tile size)
    setColumns((prev) => Math.min(5, prev + 1));
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
    })
    .onUpdate((event: any) => {
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

    // Show header when near the very top of scroll
    if (currentY <= 10) {
      headerTranslateY.value = withTiming(0, { duration: 200 });
      setTabBarVisible(true);
      lastScrollY.current = currentY;
      return;
    }

    if (dy > 6) {
      // User scrolling DOWN -> hide header & hide tab bar
      headerTranslateY.value = withTiming(-65, { duration: 250 });
      setTabBarVisible(false);
      startStopTimer();
    } else if (dy < -6) {
      // User scrolling UP -> restore header & restore tab bar immediately
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
  // Edge-to-edge layout width calculation with 1px hairline spacing (Math.floor prevents subpixel wrapping)
  const itemSize = Math.floor((windowWidth - (columns - 1) * GAP) / columns);



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
              data={mediaGroups}
              keyExtractor={(item, idx) => item.title || `group_${idx}`}

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
                        entering={FadeInUp.delay(Math.min(index * 20, 250)).duration(250)}
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
                          onPress={() => handlePressMedia(item)}
                        >
                          <Image
                            source={{
                              uri: item.localUri || item.thumbUrl || item.url,
                              headers:
                                !item.localUri && item.url?.startsWith('http')
                                  ? undefined
                                  : undefined,
                            }}
                            style={styles.thumbnailImage}
                            contentFit="cover"
                            transition={150}
                            cachePolicy="memory-disk"
                            recyclingKey={item.id}
                            placeholder={null}
                          />

                          {item.isBackedUp && (
                            <View style={[styles.cloudBadge, { backgroundColor: colors.primary }]}>
                              <Ionicons name="cloud-done" size={12} color="#FFFFFF" />
                            </View>
                          )}

                          {item.isVideo && (
                            <View style={styles.videoBadge}>
                              <Ionicons name="play" size={11} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    ))}
                  </View>
                </View>
              )}
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
  groupSection: {
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    marginVertical: 6,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  photoCard: {
    borderRadius: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  cloudBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    padding: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 9,
    padding: 3,
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
