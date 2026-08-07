import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  variant?: 'default' | 'glow' | 'subtle' | 'gradient';
  borderRadius?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 35,
  variant = 'default',
  borderRadius = 20,
}) => {
  const { isDark } = useTheme();

  const isAndroid = Platform.OS === 'android';

  const baseStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.6)',
  };

  const backgroundColor = isDark
    ? variant === 'glow'
      ? 'rgba(30, 41, 59, 0.85)'
      : 'rgba(15, 23, 42, 0.75)'
    : variant === 'glow'
    ? 'rgba(255, 255, 255, 0.9)'
    : 'rgba(255, 255, 255, 0.7)';

  if (variant === 'gradient') {
    return (
      <View style={[baseStyle, style]}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(30, 41, 59, 0.9)', 'rgba(15, 23, 42, 0.8)']
              : ['rgba(255, 255, 255, 0.95)', 'rgba(241, 245, 249, 0.85)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.content}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[baseStyle, { backgroundColor }, style]}>
      {!isAndroid ? (
        <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={styles.blurContainer}>
          <View style={styles.content}>{children}</View>
        </BlurView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  blurContainer: {
    width: '100%',
  },
  content: {
    padding: 16,
  },
});
