import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  intensity?: number;
  variant?: 'default' | 'glow' | 'subtle' | 'gradient';
  borderRadius?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  contentStyle,
  intensity = 25,
  variant = 'default',
  borderRadius = 20,
}) => {
  const { colors, isDark } = useAppTheme();
  const isAndroid = Platform.OS === 'android';

  // Separate inner flex/padding styles from outer container layout styles
  const flattened = StyleSheet.flatten(style) || {};
  const innerKeys = [
    'flexDirection',
    'alignItems',
    'justifyContent',
    'gap',
    'rowGap',
    'columnGap',
    'flexWrap',
    'padding',
    'paddingHorizontal',
    'paddingVertical',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
  ];

  const outerStyle: ViewStyle = {};
  const innerStyle: ViewStyle = {};

  Object.keys(flattened).forEach((key) => {
    if (innerKeys.includes(key)) {
      (innerStyle as any)[key] = (flattened as any)[key];
    } else {
      (outerStyle as any)[key] = (flattened as any)[key];
    }
  });

  const baseStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : colors.border,
    backgroundColor: isDark
      ? variant === 'glow'
        ? 'rgba(30, 41, 59, 0.85)'
        : 'rgba(26, 32, 44, 0.85)'
      : variant === 'glow'
      ? colors.surfaceVariant
      : colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  };

  if (variant === 'gradient') {
    return (
      <View style={[baseStyle, outerStyle]}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(30, 41, 59, 0.9)', 'rgba(15, 23, 42, 0.8)']
              : ['rgba(248, 249, 250, 0.95)', 'rgba(241, 245, 249, 0.85)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.defaultPadding, innerStyle, contentStyle]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[baseStyle, outerStyle]}>
      {!isAndroid && (
        <BlurView
          intensity={isDark ? intensity + 20 : intensity}
          tint={isDark ? 'dark' : 'regular'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[styles.defaultPadding, innerStyle, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  defaultPadding: {
    padding: 14,
  },
});
