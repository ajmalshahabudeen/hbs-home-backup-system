import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  onPrimary: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  card: string;
  text: string;
  textSecondary: string;
  subtext: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  icon: string;
  tabBar: string;
  tabBarBorder: string;
  searchBg: string;
  modalBg: string;
}

export const GooglePalette: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    primary: '#D97706', // Warm Vibrant Amber Yellow
    primaryContainer: '#FEF3C7',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#78350F',
    secondary: '#B45309',
    secondaryContainer: '#FFFBEB',
    background: '#FFFCF5',
    surface: '#FFF8E7',
    surfaceVariant: '#FDE68A',
    card: '#FFFFFF',
    text: '#1C1917',
    textSecondary: '#78350F',
    subtext: '#92400E',
    border: '#FCD34D',
    error: '#DC2626',
    success: '#16A34A',
    warning: '#F59E0B',
    icon: '#B45309',
    tabBar: '#FFFFFF',
    tabBarBorder: '#FDE68A',
    searchBg: '#FEF3C7',
    modalBg: '#FFFFFF',
  },
  dark: {
    primary: '#E5A100', // Deep Warm Golden Amber (low contrast glare, easy on eyes)
    primaryContainer: '#382203',
    onPrimary: '#14120E',
    onPrimaryContainer: '#FCD34D',
    secondary: '#D97706',
    secondaryContainer: '#261F13',
    background: '#14120E', // Deep Warm Amber Charcoal
    surface: '#1C1914',
    surfaceVariant: '#26221B',
    card: '#1C1914',
    text: '#F3F4F6', // Clean soft warm white for optimal reading comfort
    textSecondary: '#A1A1AA', // Soft muted text
    subtext: '#9CA3AF',
    border: '#382A13', // Deep subtle golden border
    error: '#F87171',
    success: '#4ADE80',
    warning: '#F59E0B',
    icon: '#D97706',
    tabBar: '#1C1914',
    tabBarBorder: '#26221B',
    searchBg: '#26221B',
    modalBg: '#1C1914',
  },
};

export const Colors = {
  light: {
    text: '#1C1917',
    background: '#FFFCF5',
    backgroundElement: '#FEF3C7',
    backgroundSelected: '#FDE68A',
    textSecondary: '#78350F',
  },
  dark: {
    text: '#F3F4F6',
    background: '#14120E',
    backgroundElement: '#1C1914',
    backgroundSelected: '#26221B',
    textSecondary: '#A1A1AA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'monospace',
  },
});
