import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (text: string) => void;
  onOpenServerScanner?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'HBS Cloud',
  subtitle,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  onOpenServerScanner,
  rightAction,
}) => {
  const { colors, isDark, themeMode, toggleTheme } = useAppTheme();
  const { isConnected, serverUrl } = useServer();
  const { user } = useAuth();

  // Pulsing animation for server live indicator dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (isConnected) {
      const pulseAnimation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.8,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.1,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.7,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0.6);
    }
  }, [isConnected]);

  // Extract friendly server address string for badge
  const displayServerHost = React.useMemo(() => {
    if (!serverUrl) return 'LAN Server';
    try {
      const cleanUrl = serverUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return cleanUrl.length > 16 ? cleanUrl.substring(0, 14) + '…' : cleanUrl;
    } catch {
      return 'LAN Server';
    }
  }, [serverUrl]);

  const isAndroid = Platform.OS === 'android';

  return (
    <View style={styles.outerWrapper}>
      <View
        style={[
          styles.floatingContainer,
          {
            backgroundColor: isDark
              ? 'rgba(26, 32, 44, 0.85)'
              : colors.surface,
            borderColor: isDark
              ? 'rgba(255, 255, 255, 0.12)'
              : colors.border,
          },
        ]}
      >
        {!isAndroid && (
          <BlurView
            intensity={isDark ? 50 : 25}
            tint={isDark ? 'dark' : 'regular'}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={styles.innerContent}>
          {/* Left Brand / Title Section */}
          <View style={styles.leftSection}>
            <LinearGradient
              colors={
                isDark
                  ? ['#3B82F6', '#8B5CF6', '#EC4899']
                  : ['#1A73E8', '#7C3AED', '#DB2777']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandIconBadge}
            >
              <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
            </LinearGradient>

            <View style={styles.titleWrapper}>
              <Text
                style={[
                  styles.brandTitle,
                  { color: colors.text },
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.subtitleText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Right Action Pills & Widgets */}
          <View style={styles.rightActions}>
            {/* Server Connection Status Indicator Capsule */}
            <TouchableOpacity
              style={styles.serverBadgeTouch}
              onPress={onOpenServerScanner}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={
                  isConnected
                    ? isDark
                      ? ['rgba(34, 197, 94, 0.22)', 'rgba(16, 185, 129, 0.12)']
                      : ['rgba(24, 128, 56, 0.12)', 'rgba(24, 128, 56, 0.05)']
                    : isDark
                    ? ['rgba(239, 68, 68, 0.22)', 'rgba(220, 38, 38, 0.12)']
                    : ['rgba(217, 48, 37, 0.12)', 'rgba(217, 48, 37, 0.05)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.serverBadgeGradient,
                  {
                    borderColor: isConnected
                      ? isDark
                        ? 'rgba(34, 197, 94, 0.4)'
                        : 'rgba(24, 128, 56, 0.3)'
                      : isDark
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'rgba(217, 48, 37, 0.3)',
                  },
                ]}
              >
                <View style={styles.dotContainer}>
                  {isConnected && (
                    <Animated.View
                      style={[
                        styles.pulseRing,
                        {
                          backgroundColor: colors.success,
                          transform: [{ scale: pulseAnim }],
                          opacity: pulseOpacity,
                        },
                      ]}
                    />
                  )}
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isConnected ? colors.success : colors.error },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.serverText,
                    {
                      color: isConnected
                        ? isDark
                          ? '#4ADE80'
                          : '#188038'
                        : isDark
                        ? '#FCA5A5'
                        : '#D93025',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {isConnected ? displayServerHost : 'Offline'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Custom Right Action (if provided) */}
            {rightAction}

            {/* Light / Dark / System Theme Toggle Glass Pill */}
            <TouchableOpacity
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : colors.surfaceVariant,
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : colors.border,
                },
              ]}
              onPress={toggleTheme}
              activeOpacity={0.75}
            >
              <Ionicons
                name={
                  themeMode === 'system'
                    ? 'desktop-outline'
                    : isDark
                    ? 'sunny'
                    : 'moon'
                }
                size={17}
                color={
                  themeMode === 'system'
                    ? colors.primary
                    : isDark
                    ? '#F59E0B'
                    : '#1A73E8'
                }
              />
            </TouchableOpacity>

            {/* User Profile Avatar with Gradient Accent Ring */}
            {user && (
              <TouchableOpacity activeOpacity={0.8} style={styles.avatarTouch}>
                <LinearGradient
                  colors={
                    isDark
                      ? ['#3B82F6', '#8B5CF6']
                      : ['#1A73E8', '#7C3AED']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarRing}
                >
                  <View
                    style={[
                      styles.avatarInner,
                      {
                        backgroundColor: isDark
                          ? '#1E293B'
                          : colors.primaryContainer,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: isDark ? '#93C5FD' : colors.primary },
                      ]}
                    >
                      {(user.name || user.email || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Embedded Dynamic Search Bar (when showSearch is true) */}
        {showSearch && (
          <View
            style={[
              styles.searchCapsule,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : colors.searchBg,
                borderColor: isDark
                  ? 'rgba(255, 255, 255, 0.1)'
                  : colors.border,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={colors.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search files, photos, backups..."
              placeholderTextColor={colors.subtext}
              value={searchQuery}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery ? (
              <TouchableOpacity
                onPress={() => onSearchChange && onSearchChange('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
    paddingBottom: 6,
    backgroundColor: 'transparent',
  },
  floatingContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  innerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    backgroundColor: 'transparent',
  },
  brandIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#1A73E8',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  titleWrapper: {
    justifyContent: 'center',
    flexShrink: 1,
    backgroundColor: 'transparent',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  serverBadgeTouch: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  serverBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    maxWidth: 130,
  },
  dotContainer: {
    width: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  serverText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTouch: {
    borderRadius: 17,
  },
  avatarRing: {
    padding: 1.5,
    borderRadius: 17,
  },
  avatarInner: {
    width: 29,
    height: 29,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 12,
  },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
});
