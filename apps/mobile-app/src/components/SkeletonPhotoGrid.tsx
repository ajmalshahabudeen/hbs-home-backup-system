import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../context/ThemeContext';

interface SkeletonPhotoGridProps {
  columns?: number;
  itemCount?: number;
}

const windowWidth = Dimensions.get('window').width;

export const SkeletonPhotoGrid: React.FC<SkeletonPhotoGridProps> = ({
  columns = 3,
  itemCount = 18,
}) => {
  const { colors } = useAppTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const itemSize = (windowWidth - 32 - (columns - 1) * 4) / columns;
  const items = Array.from({ length: itemCount }, (_, i) => i);

  return (
    <View style={styles.container}>
      {/* Fake Header Bar Skeleton */}
      <View style={styles.headerSkeleton}>
        <Animated.View
          style={[
            styles.headerPill,
            { backgroundColor: colors.surfaceVariant },
            animatedStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.headerPillSmall,
            { backgroundColor: colors.surfaceVariant },
            animatedStyle,
          ]}
        />
      </View>

      {/* Grid Skeleton */}
      <View style={styles.gridContainer}>
        {items.map((key) => (
          <Animated.View
            key={key}
            style={[
              styles.skeletonCard,
              {
                width: itemSize,
                height: itemSize,
                backgroundColor: colors.surfaceVariant,
              },
              animatedStyle,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerPill: {
    width: 120,
    height: 32,
    borderRadius: 16,
  },
  headerPillSmall: {
    width: 80,
    height: 32,
    borderRadius: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  skeletonCard: {
    borderRadius: 10,
  },
});
