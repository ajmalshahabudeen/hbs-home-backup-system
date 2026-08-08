import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  LinearTransition,
} from 'react-native-reanimated';
import { useAppTheme } from '../context/ThemeContext';
import { useTabBarStore } from '../stores/useTabBarStore';
import { useUploadModalStore } from '../stores/useUploadModalStore';

export interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

interface TabIconConfig {
  inactive: keyof typeof Ionicons.glyphMap;
  label: string;
}

const TAB_ICONS: Record<string, TabIconConfig> = {
  photos: {
    inactive: 'images-outline',
    label: 'Photos',
  },
  drive: {
    inactive: 'folder-open-outline',
    label: 'Drive',
  },
  backup: {
    inactive: 'cloud-upload-outline',
    label: 'Backup',
  },
  settings: {
    inactive: 'settings-outline',
    label: 'Settings',
  },
};

const TabBarItem: React.FC<{
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  colors: any;
}> = React.memo(({ routeName, isFocused, onPress, onLongPress, colors }) => {
  const visibility = useSharedValue(isFocused ? 0 : 1);

  useEffect(() => {
    visibility.value = withTiming(isFocused ? 0 : 1, {
      duration: 220,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isFocused, visibility]);

  const animatedStyle = useAnimatedStyle(() => {
    const width = interpolate(visibility.value, [0, 1], [0, 48]);
    const opacity = visibility.value;
    const scale = interpolate(visibility.value, [0, 1], [0.6, 1]);
    const margin = interpolate(visibility.value, [0, 1], [0, 3]);

    return {
      opacity,
      width,
      marginHorizontal: margin,
      transform: [{ scale }],
      overflow: 'hidden',
    };
  });

  const iconConfig = TAB_ICONS[routeName] || {
    inactive: 'grid-outline',
    label: routeName,
  };

  return (
    <Animated.View
      style={[styles.tabItem, animatedStyle]}
      pointerEvents={isFocused ? 'none' : 'auto'}
      layout={LinearTransition.duration(220)}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={iconConfig.label}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        style={styles.touchable}
      >
        <View style={[styles.iconWrapper, { backgroundColor: colors.surfaceVariant + '40' }]}>
          <Ionicons
            name={iconConfig.inactive}
            size={22}
            color={colors.primary}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isTabBarVisible = useTabBarStore((s) => s.isTabBarVisible);
  const setTabBarVisible = useTabBarStore((s) => s.setTabBarVisible);
  const openUploadModal = useUploadModalStore((s) => s.openUploadModal);

  const tabBarTranslateY = useSharedValue(0);

  useEffect(() => {
    tabBarTranslateY.value = withTiming(isTabBarVisible ? 0 : 100, {
      duration: 220,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isTabBarVisible, tabBarTranslateY]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: tabBarTranslateY.value }],
      opacity: interpolate(tabBarTranslateY.value, [0, 90], [1, 0]),
    };
  });

  const bottomOffset = Math.max(insets.bottom, 12) + 8;
  const glassBg = isDark ? 'rgba(20, 20, 28, 0.88)' : 'rgba(255, 255, 255, 0.92)';
  const glassBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.tabBarContainer, animatedContainerStyle, { bottom: bottomOffset }]}
    >
      {/* Floating Tab Selector Bar */}
      <Animated.View
        layout={LinearTransition.duration(220)}
        style={[
          styles.floatingBar,
          {
            backgroundColor: glassBg,
            borderColor: glassBorder,
          },
        ]}
      >
        {state.routes.map((route: { key: string; name: string; params?: object }, index: number) => {
          const isFocused = state.index === index;

          const onPress = () => {
            setTabBarVisible(true);
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TabBarItem
              key={route.key}
              routeName={route.name}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              colors={colors}
            />
          );
        })}
      </Animated.View>

      {/* Floating Action Capsule (Search + Plus Buttons) grouped alongside Tab Selector */}
      <Animated.View
        layout={LinearTransition.duration(220)}
        style={[
          styles.actionCapsule,
          {
            backgroundColor: glassBg,
            borderColor: glassBorder,
          },
        ]}
      >
        {/* Search Icon Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => router.push('/search')}
          activeOpacity={0.75}
          style={styles.actionBtn}
        >
          <View style={[styles.iconWrapper, { backgroundColor: colors.surfaceVariant + '40' }]}>
            <Ionicons name="search-outline" size={21} color={colors.primary} />
          </View>
        </TouchableOpacity>

        
        {/* Plus Upload Floating Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Upload"
          onPress={openUploadModal}
          activeOpacity={0.8}
          style={styles.actionBtn}
        >
          <View style={[styles.iconWrapper, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    zIndex: 999,
  },
  floatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    height: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    height: 56,
    gap: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  actionBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    width: 1,
    height: 22,
  },
  tabItem: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
