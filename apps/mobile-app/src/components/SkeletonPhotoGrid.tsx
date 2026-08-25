import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, ScrollView } from 'react-native';
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
const GAP = 1;

export const SkeletonPhotoGrid: React.FC<SkeletonPhotoGridProps> = ({
  columns = 3,
  itemCount = 30,
}) => {
  const { colors } = useAppTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.75, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const itemSize = Math.floor((windowWidth - (columns - 1) * GAP) / columns);
  const items = Array.from({ length: itemCount }, (_, i) => i);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <View style={styles.gridContainer}>
        {items.map((key) => {
          const isRowEnd = (key + 1) % columns === 0;
          return (
            <Animated.View
              key={key}
              style={[
                styles.skeletonCard,
                {
                  width: itemSize,
                  height: itemSize,
                  marginRight: isRowEnd ? 0 : GAP,
                  marginBottom: GAP,
                  backgroundColor: colors.surfaceVariant,
                },
                animatedStyle,
              ]}
            />
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 48,
    paddingBottom: 110,
    paddingHorizontal: 0,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  skeletonCard: {
    borderRadius: 0,
    overflow: 'hidden',
  },
});
